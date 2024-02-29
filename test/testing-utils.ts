/**
 * Utility to flush current promises during a test when using fake timers
 */
export function flushPromises(): Promise<void> {
    return new Promise(jest.requireActual('timers').setImmediate)
}
