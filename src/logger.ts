import * as winston from 'winston';

// Create Winston logger with console transport only
export const logger = winston.createLogger({
    level: 'debug', // Set log level (error, warn, info, debug)
    format: winston.format.combine(
        winston.format.colorize(), // Adds color to console logs
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Adds timestamp
        winston.format.printf(({ timestamp, level, message }) => {
            if (typeof message === 'object') {
                message = JSON.stringify(message, null, 4); // Pretty print objects
            }
            return `${timestamp} [${level}]: ${message}`; // Custom format
        }),
    ),
    transports: [
        new winston.transports.Console({ forceConsole: true }), // Logs only to the terminal and in debug terminal with force console
    ],
});
