import { Handler, callHandlers } from './Handler'
import { Channel } from './Channel'
import {
    TransportRegistrationMessage,
    TransportError,
    TransportRequest,
    TransportResponse,
    TransportMessage
} from './Message'

let _ID = 0

const getId = () => `${_ID++}`

const assertNever = (a: never) => {
    throw new Error(`Should not happen: ${a}`)
}

const DEFAULT_TIMEOUT = 5000

const ERRORS = {
    TIMED_OUT: 'TIMED_OUT',
    REMOTE_CONNECTION_CLOSED: 'REMOTE_CONNECTION_CLOSED',
    CHANNEL_NOT_READY: 'CHANNEL_NOT_READY'
}

export type PendingRequest = {
    resolve: (data?: any) => void;
    reject: (e: Error) => void;
}

export type PendingRequests = {
    [slotName: string]: {
        [requestId: string]: PendingRequest
    }
}

export class Transport {

    private _localHandlers: { [slotName: string]: Handler[] } = {}
    private _localHandlerRegistrations: TransportRegistrationMessage[] = []

    /**
     * Handlers created by the Transport. When an event is triggered locally,
     * these handlers will make a request to the far end to handle this event,
     * and store a PendingRequest
     */
    private _remoteHandlers: { [slotName: string]: Handler } = {}

    /**
     * Callbacks provided by each slot allowing to register remote handlers
     * created by the Transport
     */
    private _remoteHandlerRegistrationCallbacks: { [slotName: string]: (newHandler: Handler) => void } = {}

    /**
     * Callbacks provided by each slot allowing to unregister the remote handlers
     * created by the Transport, typically when the remote connection is closed.
     */
    private _remoteHandlerDeletionCallbacks: { [slotName: string]: (newHandler: Handler) => void } = {}

    /**
     * Requests that have been sent to the far end, but have yet to be fulfilled
     */
    private _pendingRequests: PendingRequests = {}
    private _channelReady = false

    constructor(private _channel: Channel) {
        this._channel.onData((message: TransportMessage) => {
            switch (message.type) {
                case 'request':
                    return this._requestReceived(message)
                case 'response':
                    return this._responseReceived(message)
                case 'handler_registered':
                    return this._registerRemoteHandler(message)
                case 'error':
                    return this._errorReceived(message)
                default:
                    assertNever(message)
            }
        })
        this._channel.onConnect(() => {
            this._channelReady = true

            // When the far end connects, signal which local handlers are set
            this._localHandlerRegistrations.forEach(msg => {
                this._channel.send(msg)
            })
        })
        this._channel.onDisconnect(() => {
            this._channelReady = false

            // When the far end disconnects, remove all the handlers it had set
            this._unregisterHandlers()
            this._rejectAllPendingRequests(new Error(`${ERRORS.REMOTE_CONNECTION_CLOSED}`))
        })

        // When an error happens on the channel, reject all pending requests
        // (their integrity cannot be guaranteed since onError does not link
        // the error to a requestId)
        this._channel.onError(e => this._rejectAllPendingRequests(e))
    }

    /**
     * When a request is received from the far end, call all the local subscribers,
     * and send either a response or an error mirroring the request id,
     * depending on the status of the resulting promise
     */
    private _requestReceived({ slotName, data, id }: TransportRequest): void {
        // Get local handlers
        const handlers = this._localHandlers[slotName]
        if (!handlers) {
            return
        }

        // Call local handlers with the request data
        callHandlers(data, handlers)

            // If the resulting promise is fulfilled, send a response to the far end
            .then(response => this._channel.send({
                type: 'response',
                slotName,
                id,
                data: response
            })
            )

            // If the resulting promise is rejected, send an error to the far end
            .catch((error: Error) => this._channel.send({
                type: 'error',
                slotName,
                id,
                message: `${error}`,
                stack: error.stack || ''
            }))
    }

    /**
     * When a response is received from the far end, resolve the pending promise
     * with the received data
     */
    private _responseReceived({ slotName, data, id }: TransportResponse): void {
        if (!this._pendingRequests[slotName][id]) {
            return
        }
        this._pendingRequests[slotName][id].resolve(data)
        delete this._pendingRequests[slotName][id]
    }

    /**
     * When an error is received from the far end, reject the pending promise
     * with the received data
     */
    private _errorReceived({ slotName, id, message, stack }: TransportError): void {
        if (!this._pendingRequests[slotName][id]) {
            return
        }
        const error = new Error(`${message} on ${slotName}`)
        error.stack = stack || error.stack
        this._pendingRequests[slotName][id].reject(error)
        delete this._pendingRequests[slotName][id]
    }

    /**
     * When the far end signals that a handler has been added for a given slot,
     * add a handler on our end. When called, this handler will send a request
     * to the far end, and keep references to the returned Promise's resolution
     * and rejection function
     *
     */
    private _registerRemoteHandler({ slotName }: TransportMessage): void {
        const addHandler = this._remoteHandlerRegistrationCallbacks[slotName]
        if (!addHandler) {
            return
        }
        if (this._remoteHandlers[slotName]) {
            return
        }
        const remoteHandler = (requestData: any) => new Promise((resolve, reject) => {
            // If the channel is not ready, reject immediately
            // TODO think of a better (buffering...) solution in the future
            if (!this._channelReady) {
                return reject(new Error(`${ERRORS.CHANNEL_NOT_READY} on ${slotName}`))
            }

            // Keep a reference to the pending promise's
            // resolution and rejection callbacks
            if (!this._pendingRequests[slotName]) {
                this._pendingRequests[slotName] = {}
            }
            const id = getId()
            this._pendingRequests[slotName][id] = { resolve, reject }

            // Send a request to the far end
            this._channel.send({
                type: 'request',
                id,
                slotName,
                data: requestData
            })

            // Handle request timeout if needed
            setTimeout(() => {
                if (this._pendingRequests[slotName][id]) {
                    this._pendingRequests[slotName][id].reject(new Error(`${ERRORS.TIMED_OUT} on ${slotName}`))
                    delete this._pendingRequests[slotName][id]
                }
            }, this._channel.timeout || DEFAULT_TIMEOUT)
        })
        this._remoteHandlers[slotName] = remoteHandler
        addHandler(remoteHandler)
    }

    private _unregisterHandlers(): void {
        Object.keys(this._remoteHandlerDeletionCallbacks)
            .forEach(slotName => {
                const unregisterRemoteHandler = this._remoteHandlerDeletionCallbacks[slotName]
                const remoteHandler = this._remoteHandlers[slotName]
                if (remoteHandler && unregisterRemoteHandler) {
                    unregisterRemoteHandler(remoteHandler)
                    delete this._remoteHandlers[slotName]
                }
            })
    }

    private _rejectAllPendingRequests(e: Error): void {
        Object.keys(this._pendingRequests).forEach(slotName => {
            Object.keys(this._pendingRequests[slotName]).forEach(id => {
                this._pendingRequests[slotName][id].reject(e)
            })
            this._pendingRequests[slotName] = {}
        })
    }

    /**
     * Called on slot creation.
     * The provided callbacks will be used when remote handlers are registered,
     * to add a corresponding local handler.
     */
    public onRemoteHandlerRegistered(slotName: string, addLocalHandler: (h: Handler<any, any>) => void): void {
        if (!this._remoteHandlerRegistrationCallbacks[slotName]) {
            this._remoteHandlerRegistrationCallbacks[slotName] = addLocalHandler
        }
    }

    /**
     * Called on slot creation.
     * The provided callbacks will be used when the far end disconnects,
     * to remove the handlers we had registered.
     */
    public onRemoteHandlerUnregistered(slotName: string, removeHandler: (h: Handler<any, any>) => void): void {
        if (!this._remoteHandlerDeletionCallbacks[slotName]) {
            this._remoteHandlerDeletionCallbacks[slotName] = removeHandler
        }
    }

    /**
     * Called when a local handler is registered, to send a `handler_registered`
     * message to the far end.
     */
    public registerHandler(slotName: string, handler: Handler<any, any>): void {
        if (!this._localHandlers[slotName]) {
            this._localHandlers[slotName] = []
        }
        this._localHandlers[slotName].push(handler)
        const registrationMessage: TransportRegistrationMessage = {
            type: 'handler_registered',
            slotName
        }
        this._localHandlerRegistrations.push(registrationMessage)
        if (this._channelReady) {
            this._channel.send(registrationMessage)
        }
    }

}
