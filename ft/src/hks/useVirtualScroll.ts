// useVirtual.ts




import { Ref } from "../interface/Ref.js";
import { useEffectDep, useState } from "../state.js";
import { useRef } from "../jsx-runtime.js";
import { useCallback } from "./useCallback.js";

type ScrollDirection = 'forward' | 'backward';

type VirtualItem = {
  index: number;
  start: number;
  size: number;
  end: number;
  measureRef: (el: HTMLElement | null) => void;
};

type VirtualOptions = {
  size: number;
  parentRef: Ref<HTMLElement>;
  estimateSize?: (index: number) => number;
  overscan?: number;
  paddingStart?: number;
  paddingEnd?: number;
  horizontal?: boolean;
  scrollToFn?: (offset: number, defaultScrollToFn: (offset: number) => void) => void;
  onScrollStart?: (direction: ScrollDirection) => void;
  onScrollEnd?: () => void;
};

type VirtualReturn = {
  virtualItems: VirtualItem[];
  totalSize: number;
  scrollTo: (index: number) => void;
  scrollToOffset: (offset: number) => void;
  measure: (index?: number) => void;
  getVirtualItemForOffset: (scrollOffset: number) => VirtualItem | undefined;
  getOffsetForAlignment: (index: number, align: 'start' | 'center' | 'end') => number;
};

export function useVirtual(options: VirtualOptions): VirtualReturn {
  const {
    size,
    parentRef,
    estimateSize = () => 50,
    overscan = 3,
    paddingStart = 0,
    paddingEnd = 0,
    horizontal = false,
    scrollToFn,
    onScrollStart,
    onScrollEnd
  } = options;

  const [measurementCache, setMeasurementCache] = useState<Record<number, number>>({});
  const [scrollOffset, setScrollOffset] = useState(0);
  const [isScrolling, setIsScrolling] = useState(false);
  const scrollTimeout = useRef<number | null>(null);
  const scrollDirection = useRef<ScrollDirection>('forward');
  const prevScrollOffset = useRef(0);
  
  // Para detectar quando uma medição causa uma mudança que afeta a posição de rolagem
  const hasPendingMeasurements = useRef(true);
  const recomputePositions = useRef(false);
  
  // Atualiza o deslocamento de rolagem quando o elemento pai é rolado
  useEffectDep(() => {
    const parentElem = parentRef.current;
    if (!parentElem) return;

    const handleScroll = () => {
      const currentOffset = horizontal ? parentElem.scrollLeft : parentElem.scrollTop;
      
      if (currentOffset !== prevScrollOffset.current) {
        scrollDirection.current = currentOffset > prevScrollOffset.current! ? 'forward' : 'backward';
        
        if (!isScrolling) {
          setIsScrolling(true);
          onScrollStart?.(scrollDirection.current);
        }
        
        setScrollOffset(currentOffset);
        prevScrollOffset.current = currentOffset;

        if (scrollTimeout.current !== null) {
          window.clearTimeout(scrollTimeout.current);
        }
        
        scrollTimeout.current = window.setTimeout(() => {
          setIsScrolling(false);
          onScrollEnd?.();
          scrollTimeout.current = null;
        }, 150);
      }
    };

    parentElem.addEventListener('scroll', handleScroll);
    return () => {
      parentElem.removeEventListener('scroll', handleScroll);
      if (scrollTimeout.current) {
        window.clearTimeout(scrollTimeout.current);
      }
    };
  }, [parentRef, horizontal, onScrollStart, onScrollEnd, isScrolling]);
  
  // Função para medir elementos renderizados
  const measure = useCallback((index?: number) => {
    if (index !== undefined) {
      // Medir apenas um item específico
      setMeasurementCache((cache: Record<number, number>) => {
        // Só atualiza se for diferente para evitar re-renderizações desnecessárias
        if (cache[index] === undefined) {
          hasPendingMeasurements.current = true;
          return { ...cache, [index]: estimateSize(index) };
        }
        return cache;
      });
    } else {
      // Redefinir todas as medições
      setMeasurementCache({});
      hasPendingMeasurements.current = true;
    }
  }, [estimateSize]);

  // Atualizar medições quando o tamanho da lista muda
  useEffectDep(() => {
    hasPendingMeasurements.current = true;
  }, [size]);
  
  // Recuperar tamanho do item pelo índice
  const getItemSize = (index: number): number => {
    return measurementCache()[index] ?? estimateSize(index);
  };

  // Calcular posições iniciais e tamanhos
  const calculatePositions = useCallback(() => {
    const itemPositions: {start: number, end: number, size: number}[] = [];
    let currentPosition = paddingStart;
    
    for (let i = 0; i < size; i++) {
      const itemSize = getItemSize(i);
      itemPositions[i] = {
        start: currentPosition,
        size: itemSize,
        end: currentPosition + itemSize
      };
      currentPosition += itemSize;
    }
    
    return {
      itemPositions,
      totalSize: currentPosition + paddingEnd
    };
  }, [size, paddingStart, paddingEnd, getItemSize]);
  
  const positionsRef = useRef(calculatePositions());
  
  // Recalcula posições quando as medições são alteradas
  useEffectDep(() => {
    if (hasPendingMeasurements.current) {
      positionsRef.current = calculatePositions();
      hasPendingMeasurements.current = false;
      
      // Se precisamos recomputar as posições após uma medição
      if (recomputePositions.current) {
        recomputePositions.current = false;
        // Restaurar a posição de rolagem para manter o conteúdo visível estável
        const parentElem = parentRef.current;
        if (parentElem) {
          if (horizontal) {
            parentElem.scrollLeft = scrollOffset();
          } else {
            parentElem.scrollTop = scrollOffset();
          }
        }
      }
    }
  }, [calculatePositions, measurementCache, parentRef, scrollOffset, horizontal]);
  
  // Encontrar itens visíveis
  const getVirtualItems = useCallback(() => {
    const parentElem = parentRef.current;
    if (!parentElem) return [];

    const { itemPositions } = positionsRef.current!;
    const viewportSize = horizontal ? parentElem.clientWidth : parentElem.clientHeight;
    const startOffset = Math.max(0, scrollOffset() - overscan * (estimateSize(0) || 50));
    const endOffset = Math.min(
      positionsRef.current?.totalSize || 0,
      scrollOffset() + viewportSize + overscan * (estimateSize(0) || 50)
    );
    
    const virtualItems: VirtualItem[] = [];
    
    // Busca binária para encontrar o primeiro item visível (otimização para grandes listas)
    let startIndex = 0;
    let endIndex = size - 1;
    let middleIndex;
    
    while (startIndex <= endIndex) {
      middleIndex = Math.floor((startIndex + endIndex) / 2);
      const itemPosition = itemPositions[middleIndex];
      
      if (!itemPosition) {
        break;
      }
      
      if (itemPosition.end < startOffset) {
        startIndex = middleIndex + 1;
      } else if (itemPosition.start > endOffset) {
        endIndex = middleIndex - 1;
      } else {
        endIndex = middleIndex - 1; // Continua a busca à esquerda
      }
    }
    
    // Encontra o primeiro item visível
    const firstItemIndex = Math.max(0, startIndex);
    
    // Adiciona todos os itens visíveis
    for (let i = firstItemIndex; i < size; i++) {
      const itemPosition = itemPositions[i];
      
      if (!itemPosition || itemPosition.start > endOffset) {
        break;
      }
      
      if (itemPosition.end >= startOffset) {
        virtualItems.push({
          index: i,
          start: itemPosition.start,
          size: itemPosition.size,
          end: itemPosition.end,
          measureRef: (el) => {
            if (el) {
              const newSize = horizontal ? el.offsetWidth : el.offsetHeight;
              if (newSize !== measurementCache()[i] && newSize > 0) {
                setMeasurementCache((cache: Record<number, number>) => {
                  if (cache[i] !== newSize) {
                    hasPendingMeasurements.current = true;
                    recomputePositions.current = true;
                    return { ...cache, [i]: newSize };
                  }
                  return cache;
                });
              }
            }
          }
        });
      }
    }
    
    return virtualItems;
  }, [scrollOffset, overscan, estimateSize, size, horizontal, measurementCache]);
  
  const virtualItems = getVirtualItems();
  
  // Funções auxiliares de rolagem
  const getVirtualItemForOffset = useCallback((offset: number) => {
    const { itemPositions } = positionsRef.current!;
    
    // Busca binária para encontrar o item na posição de deslocamento
    let startIndex = 0;
    let endIndex = size - 1;
    let middleIndex;
    
    while (startIndex <= endIndex) {
      middleIndex = Math.floor((startIndex + endIndex) / 2);
      const itemPosition = itemPositions[middleIndex];
      
      if (!itemPosition) {
        break;
      }
      
      if (offset < itemPosition.start) {
        endIndex = middleIndex - 1;
      } else if (offset >= itemPosition.end) {
        startIndex = middleIndex + 1;
      } else {
        return {
          index: middleIndex,
          start: itemPosition.start,
          size: itemPosition.size,
          end: itemPosition.end,
          measureRef: () => {}
        };
      }
    }
    
    return undefined;
  }, [size]);
  
  const getOffsetForAlignment = useCallback((index: number, align: 'start' | 'center' | 'end') => {
    const { itemPositions } = positionsRef.current!;
    const item = itemPositions[index];
    if (!item) return 0;
    
    const parentElem = parentRef.current;
    if (!parentElem) return 0;
    
    const viewportSize = horizontal ? parentElem.clientWidth : parentElem.clientHeight;
    
    if (align === 'start') {
      return item.start;
    } else if (align === 'center') {
      return Math.max(0, item.start - viewportSize / 2 + item.size / 2);
    } else if (align === 'end') {
      return Math.max(0, item.end - viewportSize);
    }
    
    return 0;
  }, [horizontal, parentRef]);
  
  const scrollToOffset = useCallback((offset: number) => {
    const parentElem = parentRef.current;
    if (!parentElem) return;
    
    const defaultScrollToFn = (offset: number) => {
      if (horizontal) {
        parentElem.scrollLeft = offset;
      } else {
        parentElem.scrollTop = offset;
      }
    };
    
    if (scrollToFn) {
      scrollToFn(offset, defaultScrollToFn);
    } else {
      defaultScrollToFn(offset);
    }
  }, [horizontal, parentRef, scrollToFn]);
  
  const scrollTo = useCallback((index: number) => {
    const offset = getOffsetForAlignment(index, 'start');
    scrollToOffset(offset);
  }, [getOffsetForAlignment, scrollToOffset]);
  
  return {
    virtualItems,
    totalSize: positionsRef.current?.totalSize || 0,
    scrollTo,
    scrollToOffset,
    measure,
    getVirtualItemForOffset,
    getOffsetForAlignment
  };
}
