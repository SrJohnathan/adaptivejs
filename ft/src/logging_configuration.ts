// Crie um sistema de log dedicado
export const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Configuração que pode ser acessada pelo consumidor
export const config = {
  logLevel: LogLevel.WARN, // Nível padrão
  enableConsole: true
};

export function setupLogging(options: { logLevel?: number, enableConsole?: boolean }) {
  Object.assign(config, options);
}

// Funções de log que verificam a configuração
export const logger = {
  error: (message: string, ...args: any[]) => {
    if (config.enableConsole && config.logLevel >= LogLevel.ERROR) {
      console.error(`[Hydrate Error] ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: any[]) => {
    if (config.enableConsole && config.logLevel >= LogLevel.WARN) {
      console.warn(`[Hydrate Warning] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: any[]) => {
    if (config.enableConsole && config.logLevel >= LogLevel.INFO) {
      console.info(`[Hydrate Info] ${message}`, ...args);
    }
  },
  debug: (message: string, ...args: any[]) => {
    if (config.enableConsole && config.logLevel >= LogLevel.DEBUG) {
      console.debug(`[Hydrate Debug] ${message}`, ...args);
    }
  }
};