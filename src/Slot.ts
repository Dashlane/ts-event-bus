import { Transport } from './Transport'
import { Handler, callHandlers } from './Handler'

const signalNotConnected = () => { throw new Error('Slot not connected') }

const FAKE_SLOT: any = () => signalNotConnected()
FAKE_SLOT.on = signalNotConnected

export type Unsubscribe = () => void

/**
 * Represents an event shared by two modules.
 *
 * A module can trigger the event by calling the slot. This will return a promise,
 * which will be resolved with the response sent by the other module if applicable.
 *
 * The slot can also be subscribed to, by using the `on` property.
 */
export interface Slot<RequestData=null, ResponseData=void> {

    // Make the Slot callable: this is how an event is triggered
    // TODO: Find a solution to make it possible to omit the requestData as
    // optional only when explicitly typed as such by the client.
    (requestData: RequestData): Promise<ResponseData>
    on: (handler: Handler<RequestData, ResponseData>) => Unsubscribe
}

/**
 * A shorthand function used to declare slots in event bus object literals
 * It returns a fake slot, that will throw if triggered or subscribed to.
 * Slots need to be connected in order to be functional.
 */
export function slot<RequestData=void, ResponseData=void>(): Slot<RequestData, ResponseData> {
    return FAKE_SLOT
}

export function connectSlot<T=void, T2=void>(slotName: string, transports: Transport[]): Slot<T, T2> {

    // These will be all the handlers for this slot (eg. all the callbacks registered with `Slot.on()`)
    const handlers = [] as Handler<any, any>[]

    // For each transport we create a Promise that will be fulfilled only
    // when the far-end has registered a handler.
    // This prevents `triggers` from firing *before* any far-end is listening.
    let remoteHandlersConnected = [] as Promise<any>[]

    // Signal to all transports that we will accept handlers for this slotName
    transports.forEach(t => {

        // Variable holds the promise's `resolve` function. A little hack
        // allowing us to have the notion of "deferred" promise fulfillment.
        let onHandlerRegistered: Function
        let remoteHandlerPromise: Promise<void>

        const awaitHandlerRegistration = () => {
            // We store a reference to this promise to be resolved once the far-end has responded.
            remoteHandlerPromise = new Promise(resolve => onHandlerRegistered = resolve)
            remoteHandlersConnected.push(remoteHandlerPromise)
        }

        awaitHandlerRegistration()

        t.onRemoteHandlerRegistered(slotName, (handler: Handler<any, any>) => {
            handlers.push(handler)

            // We signal that the transport is ready for this slot by resolving the
            // promise stored in `remoteHandlersConnected`.
            onHandlerRegistered()
        })

        t.onRemoteHandlerUnregistered(slotName, handler => {
            const handlerIndex = handlers.indexOf(handler)
            handlers.splice(handlerIndex, 1)

            // When the channel disconnects we also need to remove the
            // promise blocking the trigger.
            remoteHandlersConnected.splice(remoteHandlersConnected.indexOf(remoteHandlerPromise), 1)

            // And also insert a new promise that will be re-fulfilled when
            // remote handlers are re-registered.
            awaitHandlerRegistration()
        })
    })


    // Called when a client triggers (calls) the slot
    // Before calling the handler, we also check that all the declared transports
    // are ready to answer to the request.
    // If no transports were declared, call directly the handlers.
    const trigger: any = (data: any) => (transports.length) ?
        Promise.all(remoteHandlersConnected).then(() => callHandlers(data, handlers)) :
        callHandlers(data, handlers)

    // Called when a client subscribes to the slot (with `Slot.on()`)
    trigger.on = (handler: Handler<any, any>): Unsubscribe => {

        // Register a remote handler with all of our remote transports
        transports.forEach(t => t.registerHandler(slotName, handler))

        // Store this handler
        handlers.push(handler)

        // Return the unsubscription function
        return () => {
            const ix = handlers.indexOf(handler)
            if (ix !== -1) {
                handlers.splice(ix, 1)
            }
        }

    }

    return trigger as Slot<T, T2>
}
