import { adaptiveCreateElement, type AdaptiveUIChild, type AdaptiveUIProps } from "../primitives.js";

export type SpacerProps = AdaptiveUIProps & {
  size?: number | string;
  width?: number | string;
  height?: number | string;
};

export function Spacer(size: number | string = 16, props: AdaptiveUIProps = {}): AdaptiveUIChild {
  return adaptiveCreateElement("spacer", {
    ...props,
    size
  });
}

export function SpacerBox(props: SpacerProps = {}): AdaptiveUIChild {
  const {
    size,
    width = size,
    height = size,
    ...rest
  } = props;

  return adaptiveCreateElement("spacer", {
    ...rest,
    ...(size !== undefined ? { size } : {}),
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {})
  });
}

export default Spacer;
