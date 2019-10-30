import { Transport } from './Transport'
import { Handler, callHandlers } from './Handler'
import { DEFAULT_PARAM } from './Constants'

const signalNotConnected = () => { throw new Error('Slot not connected') }

const notConnectedSlot: Slot<any, any> = Object.assign(
    () => signalNotConnected(),
    {
        on: signalNotConnected,
        lazy: signalNotConnected,
        slotName: 'Not connected'
    }
)

export type LazyCallback = (param: string) => void
export type Unsubscribe = () => void

// Key to store local handlers in the `handlers` map
const LOCAL_TRANSPORT = 'LOCAL_TRANSPORT'

// Type to store handlers, by transport, by param
type TransportHandlers = { [param: string]: Handler<any, any>[] }
type Handlers = { [handlerKey: string]: TransportHandlers }

// Find handlers for given param accross transports
const getParamHandlers = (param: string, handlers: Handlers): Handler<any, any>[] =>
    Object.keys(handlers).reduce((paramHandlers, transportKey) => {
        return paramHandlers.concat(handlers[transportKey][param] || [])
    }, [] as Handler<any, any>[])

// Find all params with registered callbacks
const findAllUsedParams = (handlers: Handlers): string[] =>
    Object.keys(handlers).reduce((params, transportKey) => {
        const transportHandlers = handlers[transportKey]
        const registeredParams = Object.keys(transportHandlers).filter(
            param => (transportHandlers[param] || []).length > 0
        )
        const paramsMaybeDuplicate = [...params, ...registeredParams]
        const paramsUniq = [...new Set(paramsMaybeDuplicate)]
        return paramsUniq
    }, [] as string[])

interface SlotConfig {
    // This option will prevent the slot from buffering the
    // requests if no remote handlers are set for some transports.
    noBuffer?: boolean
}

/**
 * Represents an event shared by two modules.
 *
 * A module can trigger the event by calling the slot. This will return a promise,
 * which will be resolved with the response sent by the other module if applicable.
 *
 * The slot can also be subscribed to, by using the `on` property.
 */
export interface Slot<RequestData=null, ResponseData=void> {
    // TODO: Find a solution to make it possible to omit the requestData as
    // optional only when explicitly typed as such by the client.

    // Trigger the slot with explicit param
    (param: string, requestData: RequestData): Promise<ResponseData>

    // Trigger the slot with default param
    (requestData: RequestData): Promise<ResponseData>

    // Listen to events sent through the slot on explicit param
    on(param: string, handler: Handler<RequestData, ResponseData>): Unsubscribe

    // Listen to events sent through the slot on default param
    on(handler: Handler<RequestData, ResponseData>): Unsubscribe

    // Provide the slot with lazy callbacks
    lazy(connect: LazyCallback, disconnect: LazyCallback): Unsubscribe

    // Retreive slot configuration
    config?: SlotConfig

    // Helpful for debugging
    slotName: string
}

/**
 * A shorthand function used to declare slots in event bus object literals
 * It returns a fake slot, that will throw if triggered or subscribed to.
 * Slots need to be connected in order to be functional.
 */
export function slot<RequestData=void, ResponseData=void>(
    config: SlotConfig = { noBuffer: false }
): Slot<RequestData, ResponseData> {
    return Object.assign(notConnectedSlot, config)
}

export function connectSlot<T=void, T2=void>(
    slotName: string,
    transports: Transport[],
    config: SlotConfig = {}
): Slot<T, T2> {

    /*
     * ========================
     * Internals
     * ========================
     */

    // These will be all the handlers for this slot, for each transport, for each param
    const handlers: Handlers = transports.reduce(
        (acc, _t, ix) => ({ ...acc, [ix]: {} }),
        { [LOCAL_TRANSPORT]: {} }
    )

    // For each transport we create a Promise that will be fulfilled only
    // when the far-end has registered a handler.
    // This prevents `triggers` from firing *before* any far-end is listening.
    interface HandlerConnected {
        registered: Promise<void>
        onRegister: () => void
    }

    interface RemoteHandlersConnected {
        [transportKey: string]: {
            [param: string]: HandlerConnected
        }
    }

    const remoteHandlersConnected: RemoteHandlersConnected =
        transports.reduce((acc, _t, transportKey) =>
            ({ ...acc, [transportKey]: {} }),
            {}
        )

    const awaitHandlerRegistration = (
        transportKey: string,
        param: string
    ) => {
        let onHandlerRegistered = () => { }

        const remoteHandlerRegistered = new Promise<void>(
            resolve => onHandlerRegistered = resolve
        )

        remoteHandlersConnected[transportKey][param] = {
            registered: remoteHandlerRegistered,
            onRegister: onHandlerRegistered
        }
    }

    // Lazy callbacks
    const lazyConnectCallbacks: LazyCallback[] = []
    const lazyDisonnectCallbacks: LazyCallback[] = []

    const callLazyConnectCallbacks = (param: string) =>
        lazyConnectCallbacks.forEach(c => c(param))

    const callLazyDisonnectCallbacks = (param: string) =>
        lazyDisonnectCallbacks.forEach(c => c(param))

    // Signal to all transports that we will accept handlers for this slotName
    transports.forEach((transport, transportKey) => {

        const remoteHandlerRegistered = (
            param = DEFAULT_PARAM,
            handler: Handler<any, any>
        ) => {
            // Store handler
            const paramHandlers = handlers[transportKey][param] || []
            handlers[transportKey][param] = paramHandlers.concat(handler)

            // Call lazy callbacks if needed
            if (getParamHandlers(param, handlers).length === 1) callLazyConnectCallbacks(param)

            // Release potential buffered events
            if (!remoteHandlersConnected[transportKey][param]) {
                awaitHandlerRegistration(String(transportKey), param)
            }

            remoteHandlersConnected[transportKey][param].onRegister()
        }

        const remoteHandlerUnregistered = (
            param = DEFAULT_PARAM,
            handler: Handler<any, any>
        ) => {
            const paramHandlers = handlers[transportKey][param] || []
            const handlerIndex = paramHandlers.indexOf(handler)
            if (handlerIndex > -1) handlers[transportKey][param].splice(handlerIndex, 1)
            if (getParamHandlers(param, handlers).length === 0) callLazyDisonnectCallbacks(param)
            awaitHandlerRegistration(String(transportKey), param)
        }

        transport.addRemoteHandlerRegistrationCallback(slotName, remoteHandlerRegistered)
        transport.addRemoteHandlerUnregistrationCallback(slotName, remoteHandlerUnregistered)
    })

    /*
     * ========================
     * API
     * ========================
     */

    /*
     * Sends data through the slot.
     */

    // Signature for Slot(<data>) using default param
    function trigger(data: any): Promise<any>

    // Signature for Slot(<param>, <data>)
    function trigger(param: string, data: any): Promise<any>

    // Combined signatures
    function trigger(firstArg: string | any, secondArg?: any) {
        const paramUsed = arguments.length === 2
        const data: any = paramUsed ? secondArg : firstArg
        const param: string = paramUsed ? firstArg : DEFAULT_PARAM

        if (config.noBuffer || transports.length === 0) {
            const allParamHandlers = getParamHandlers(param, handlers)
            return callHandlers(data, allParamHandlers)
        }

        else {
            transports.forEach((_t, transportKey) => {
                if (!remoteHandlersConnected[transportKey][param]) {
                    awaitHandlerRegistration(String(transportKey), param)
                }
            })

            const transportPromises: Promise<void>[] = transports.reduce(
                (acc, _t, transportKey) => [
                    ...acc,
                    remoteHandlersConnected[transportKey][param].registered
                ], []
            )

            return Promise.all(transportPromises).then(() => {
                const allParamHandlers = getParamHandlers(param, handlers)
                return callHandlers(data, allParamHandlers)
            })
        }
    }

    /*
     * Allows a client to be notified when a first
     * client connects to the slot with `.on`, and when the
     * last client disconnects from it.
     */

    function lazy(
        firstClientConnectCallback: LazyCallback,
        lastClientDisconnectCallback: LazyCallback
    ): Unsubscribe {

        lazyConnectCallbacks.push(firstClientConnectCallback)
        lazyDisonnectCallbacks.push(lastClientDisconnectCallback)

        // Call connect callback immediately if handlers were already registered
        findAllUsedParams(handlers).forEach(firstClientConnectCallback)

        return () => {
            // Call disconnect callback
            findAllUsedParams(handlers).forEach(lastClientDisconnectCallback)

            // Stop lazy connect and disconnect processes
            const connectIx = lazyConnectCallbacks.indexOf(firstClientConnectCallback)
            if (connectIx > -1) lazyConnectCallbacks.splice(connectIx, 1)

            const disconnectIx = lazyDisonnectCallbacks.indexOf(lastClientDisconnectCallback)
            if (disconnectIx > -1) lazyDisonnectCallbacks.splice(disconnectIx, 1)
        }
    }

    /*
     * Allows a client to be notified when someone
     * sends data through the slot.
     */

    // Signature for Slot.on(<handler>) using default param
    function on(
        handler: Handler<any, any>
    ): Unsubscribe

    // Signature for Slot.on(<param>, <handler>)
    function on(
        param: string,
        handler: Handler<any, any>
    ): Unsubscribe

    // Combined signatures
    function on(
        paramOrHandler: string | Handler<any, any>,
        handlerIfParam?: Handler<any, any>
    ): Unsubscribe {

        // Get param and handler from arguments, depending if param was passed or not
        let param = ""
        let handler: Handler<any, any> = () => new Promise(r => r())

        if (typeof paramOrHandler === 'string') {
            param = paramOrHandler
            handler = handlerIfParam || handler
        }
        else {
            param = DEFAULT_PARAM
            handler = paramOrHandler
        }

        // Register a remote handler with all of our remote transports
        transports.forEach(t => t.registerHandler(slotName, param, handler))

        // Store this handler
        handlers[LOCAL_TRANSPORT][param] =
            (handlers[LOCAL_TRANSPORT][param] || []).concat(handler)

        // Call lazy connect callbacks if there is at least one handler
        const paramHandlers = getParamHandlers(param, handlers)
        if (paramHandlers.length === 1) callLazyConnectCallbacks(param)

        // Return the unsubscription function
        return () => {

            // Unregister remote handler with all of our remote transports
            transports.forEach(t => t.unregisterHandler(slotName, param, handler))

            const localParamHandlers = handlers[LOCAL_TRANSPORT][param] || []
            const ix = localParamHandlers.indexOf(handler)
            if (ix !== -1) handlers[LOCAL_TRANSPORT][param].splice(ix, 1)

            // Call lazy disconnect callbacks if there are no handlers anymore
            const paramHandlers = getParamHandlers(param, handlers)
            if (paramHandlers.length === 0) callLazyDisonnectCallbacks(param)
        }
    }

    return Object.assign(trigger, { on, lazy, config, slotName })
}
