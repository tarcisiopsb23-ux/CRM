/**
 * Logger estruturado com níveis configuráveis
 * Previne vazamento de dados sensíveis em produção
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  timestamp: string;
  module?: string;
}

class Logger {
  private isDevelopment = import.meta.env.DEV;
  private logLevel: LogLevel = this.getLogLevel();

  private getLogLevel(): LogLevel {
    // Em produção, apenas erros e warnings
    if (!this.isDevelopment) {
      return 'warn';
    }
    // Em desenvolvimento, permite todos os níveis
    return 'debug';
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };

    return levels[level] >= levels[this.logLevel];
  }

  private sanitizeData(data: any): any {
    if (!data || typeof data !== 'object') return data;

    // Remove dados sensíveis
    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'key',
      'auth',
      'session',
      'cookie',
      'authorization',
      'apikey',
      'api_key',
      'supabase_key',
      'service_role_key',
    ];

    const sanitized = Array.isArray(data) ? [...data] : { ...data };

    const sanitizeValue = (value: any, key: string): any => {
      if (typeof value === 'string' && sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        return '[REDACTED]';
      }
      if (typeof value === 'object' && value !== null) {
        return this.sanitizeData(value);
      }
      return value;
    };

    if (Array.isArray(sanitized)) {
      return sanitized.map(item => sanitizeValue(item, ''));
    }

    for (const key in sanitized) {
      sanitized[key] = sanitizeValue(sanitized[key], key);
    }

    return sanitized;
  }

  private formatMessage(entry: LogEntry): string {
    const parts = [
      `[${entry.timestamp}]`,
      `[${entry.level.toUpperCase()}]`,
      entry.module ? `[${entry.module}]` : '',
      entry.message,
    ].filter(Boolean);

    return parts.join(' ');
  }

  private log(level: LogLevel, message: string, context?: Record<string, any>, module?: string): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      context: context ? this.sanitizeData(context) : undefined,
      timestamp: new Date().toISOString(),
      module,
    };

    const formattedMessage = this.formatMessage(entry);

    // Em ambiente de desenvolvimento, usa console com cores
    if (this.isDevelopment) {
      const consoleMethod = level === 'error' ? console.error :
                           level === 'warn' ? console.warn :
                           level === 'info' ? console.info :
                           console.debug;

      if (entry.context) {
        consoleMethod(formattedMessage, entry.context);
      } else {
        consoleMethod(formattedMessage);
      }
    } else {
      // Em produção, poderia enviar para serviço de logs
      // Por enquanto, apenas erros e warnings
      const consoleMethod = level === 'error' ? console.error : console.warn;
      consoleMethod(formattedMessage);
    }
  }

  debug(message: string, context?: Record<string, any>, module?: string): void {
    this.log('debug', message, context, module);
  }

  info(message: string, context?: Record<string, any>, module?: string): void {
    this.log('info', message, context, module);
  }

  warn(message: string, context?: Record<string, any>, module?: string): void {
    this.log('warn', message, context, module);
  }

  error(message: string, context?: Record<string, any>, module?: string): void {
    this.log('error', message, context, module);
  }

  // Métodos específicos para módulos
  auth(message: string, context?: Record<string, any>, level: LogLevel = 'info'): void {
    this.log(level, message, context, 'AUTH');
  }

  crm(message: string, context?: Record<string, any>, level: LogLevel = 'info'): void {
    this.log(level, message, context, 'CRM');
  }

  finance(message: string, context?: Record<string, any>, level: LogLevel = 'info'): void {
    this.log(level, message, context, 'FINANCE');
  }

  security(message: string, context?: Record<string, any>, level: LogLevel = 'warn'): void {
    this.log(level, message, context, 'SECURITY');
  }
}

// Instância global
export const logger = new Logger();

// Export para uso em componentes
export default logger;
