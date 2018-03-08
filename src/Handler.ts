
/**
 * A Handler represents a callable that is capable of responding to an event.
 * It may be directly provided by the client in the case of same-process usage,
 * or provided by the transport in the case of remote usage.
 *
 * Handlers may be synchronous or asynchronous. Asynchronicity is Promise-based.
 */
export type Handler<RequestData=any, ResponseData=any> = (requestData: RequestData) => ResponseData | Promise<ResponseData>

/**
 * Helper function that allows to call synchronous and asynchronous handler
 * and map the result of the function call to a Promise
 */
function callOneHandler(h: Handler<any>, data: any): Promise<any> {
    let result: any = null
    try {
        result = h(data)
    } catch (err) {
        return Promise.reject(err)
    }
    if (result && result.then) {
        return result
    } else {
        return Promise.resolve(result)
    }
}

/**
 * Helper function to call all the handlers registered for a given event and
 * map the result of the call to a Promise.
 *
 * - If no handlers are registered, the Promise is automatically fulfilled.
 * - If one handler is registered, a Promise that will resolve with the result
 * of the call of that one handler will be returned
 * - If more than one handler is registered, a Promise that will resolve when all
 * handlers have been successfully called and fulfilled is returned, but the results
 * of all these handlers is discarded.
 */
export function callHandlers(data: any, handlers: Handler<any, any>[]): Promise<any> {
    if (handlers.length === 0) {
        // No one is listening
        return new Promise(resolve => { /* NOOP, this promise will never resolve */ })
    } else if (handlers.length === 1) {
        return callOneHandler(handlers[0], data)
    } else {
        return Promise.all(
            handlers.map(h => callOneHandler(h, data))
        )
    }
}
