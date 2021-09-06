import { Handler, callHandlers } from './Handler'
import { Channel } from './Channel'
import {
    TransportError,
    TransportMessage,
    TransportRegistrationMessage,
    TransportUnregistrationMessage,
    TransportResponse,
    TransportRequest
} from './Message'

let _ID = 0

const getId = () => `${_ID++}`

const assertNever = (a: never) => {
    throw new Error(`Should not happen: ${a}`)
}

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

type RemoteHandlerCallback =
    (param: string, handler: Handler) => void

export class Transport {

    private _localHandlers: {
        [slotName: string]: {
            [param: string]: Handler[]
        }
    } = {}

    private _localHandlerRegistrations: {
        [param: string]: TransportRegistrationMessage[]
    } = {}

    /**
     * Handlers created by the Transport. When an event is triggered locally,
     * these handlers will make a request to the far end to handle this event,
     * and store a PendingRequest
     */
    private _remoteHandlers: {
        [slotName: string]: {
            [param: string]: Handler
        }
    } = {}

    /**
     * Callbacks provided by each slot allowing to register remote handlers
     * created by the Transport
     */
    private _remoteHandlerRegistrationCallbacks:
        { [slotName: string]: RemoteHandlerCallback } = {}

    /**
     * Callbacks provided by each slot allowing to unregister the remote handlers
     * created by the Transport, typically when the remote connection is closed.
     */
    private _remoteHandlerDeletionCallbacks:
        { [slotName: string]: RemoteHandlerCallback } = {}

    /**
     * Requests that have been sent to the far end, but have yet to be fulfilled
     */
    private _pendingRequests: { [param: string]: PendingRequests } = {}

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
                case 'handler_unregistered':
                    return this._unregisterRemoteHandler(message)
                case 'error':
                    return this._errorReceived(message)
                default:
                    assertNever(message)
            }
        })
        this._channel.onConnect(() => {
            this._channelReady = true

            // When the far end connects, signal which local handlers are set
            Object.keys(this._localHandlerRegistrations).forEach(param => {
                this._localHandlerRegistrations[param].forEach(msg => {
                    this._channel.send(msg)
                })
            })
        })
        this._channel.onDisconnect(() => {
            this._channelReady = false

            // When the far end disconnects, remove all the handlers it had set
            this._unregisterAllRemoteHandlers()
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
    private _requestReceived({ slotName, data, id, param }: TransportRequest): void {
        // Get local handlers
        const slotHandlers = this._localHandlers[slotName]
        if (!slotHandlers) return

        const handlers = slotHandlers[param]
        if (!handlers) return

        // Call local handlers with the request data
        callHandlers(data, handlers)
            // If the resulting promise is fulfilled, send a response to the far end
            .then(response => this._channel.send({
                type: 'response',
                slotName,
                id,
                data: response,
                param
            }))

            // If the resulting promise is rejected, send an error to the far end
            .catch((error: Error) => this._channel.send({
                id,
                message: `${error}`,
                param,
                slotName,
                stack: error.stack || '',
                type: 'error'
            }))
    }

    /**
     * When a response is received from the far end, resolve the pending promise
     * with the received data
     */
    private _responseReceived({ slotName, data, id, param }: TransportResponse): void {
        const slotRequests = this._pendingRequests[slotName]
        if (!slotRequests || !slotRequests[param] || !slotRequests[param][id]) {
            return
        }

        slotRequests[param][id].resolve(data)
        delete slotRequests[param][id]
    }

    /**
     * When an error is received from the far end, reject the pending promise
     * with the received data
     */
    private _errorReceived({ slotName, id, message, stack, param }: TransportError): void {
        const slotRequests = this._pendingRequests[slotName]
        if (!slotRequests || !slotRequests[param] || !slotRequests[param][id]) return

        const error = new Error(`${message} on ${slotName} with param ${param}`)
        error.stack = stack || error.stack
        this._pendingRequests[slotName][param][id].reject(error)
        delete this._pendingRequests[slotName][param][id]
    }

    /**
     * When the far end signals that a handler has been added for a given slot,
     * add a handler on our end. When called, this handler will send a request
     * to the far end, and keep references to the returned Promise's resolution
     * and rejection function
     *
     */
    private _registerRemoteHandler({ slotName, param }: TransportRegistrationMessage): void {

        const addHandler = this._remoteHandlerRegistrationCallbacks[slotName]
        if (!addHandler) return

        const slotHandlers = this._remoteHandlers[slotName]

        if (slotHandlers && slotHandlers[param]) return

        const remoteHandler = (requestData: any) => new Promise((resolve, reject) => {
            // If the channel is not ready, reject immediately
            // TODO think of a better (buffering...) solution in the future
            if (!this._channelReady) {
                return reject(new Error(`${ERRORS.CHANNEL_NOT_READY} on ${slotName}`))
            }

            // Keep a reference to the pending promise's
            // resolution and rejection callbacks
            const id = getId()

            this._pendingRequests[slotName] = this._pendingRequests[slotName] || {}
            this._pendingRequests[slotName][param] = this._pendingRequests[slotName][param] || {}
            this._pendingRequests[slotName][param][id] = { resolve, reject }

            // Send a request to the far end
            this._channel.send({
                type: 'request',
                id,
                slotName,
                param,
                data: requestData
            })

            // Handle request timeout if needed
            setTimeout(() => {
                const slotHandlers = this._pendingRequests[slotName] || {}
                const paramHandlers = slotHandlers[param] || {}
                const request = paramHandlers[id]
                if (request) {
                    const error = new Error(`${ERRORS.TIMED_OUT} on ${slotName} with param ${param}`)
                    request.reject(error)
                    delete this._pendingRequests[slotName][param][id]
                }
            }, this._channel.timeout)
        })

        this._remoteHandlers[slotName] = this._remoteHandlers[slotName] || {}
        this._remoteHandlers[slotName][param] = remoteHandler

        addHandler(param, remoteHandler)
    }

    private _unregisterRemoteHandler(
        { slotName, param }: { slotName: string, param: string }
    ): void {
        const unregisterRemoteHandler = this._remoteHandlerDeletionCallbacks[slotName]
        const slotHandlers = this._remoteHandlers[slotName]
        if (!slotHandlers) return

        const remoteHandler = slotHandlers[param]
        if (remoteHandler && unregisterRemoteHandler) {
            unregisterRemoteHandler(param, remoteHandler)
            delete this._remoteHandlers[slotName][param]
        }
    }

    private _unregisterAllRemoteHandlers(): void {
        Object.keys(this._remoteHandlerDeletionCallbacks)
            .forEach(slotName => {
                const slotHandlers = this._remoteHandlers[slotName]
                if (!slotHandlers) return

                const params = Object.keys(slotHandlers).filter(param => slotHandlers[param])
                params.forEach(param => this._unregisterRemoteHandler({ slotName, param }))
            })
    }

    private _rejectAllPendingRequests(e: Error): void {
        Object.keys(this._pendingRequests).forEach(slotName => {
            Object.keys(this._pendingRequests[slotName]).forEach(param => {
                Object.keys(this._pendingRequests[slotName][param]).forEach(id => {
                    this._pendingRequests[slotName][param][id].reject(e)
                })
            })
            this._pendingRequests[slotName] = {}
        })
    }

    public addRemoteHandlerRegistrationCallback(
        slotName: string,
        addLocalHandler: (p: string, h: Handler<any, any>) => void
    ): void {
        if (!this._remoteHandlerRegistrationCallbacks[slotName]) {
            this._remoteHandlerRegistrationCallbacks[slotName] = addLocalHandler
        }
    }

    public addRemoteHandlerUnregistrationCallback(
        slotName: string,
        removeHandler: (p: string, h: Handler<any, any>) => void
    ): void {
        if (!this._remoteHandlerDeletionCallbacks[slotName]) {
            this._remoteHandlerDeletionCallbacks[slotName] = removeHandler
        }
    }

    /**
     * Called when a local handler is registered, to send a `handler_registered`
     * message to the far end.
     */
    public registerHandler(
        slotName: string,
        param: string,
        handler: Handler<any, any>
    ): void {

        this._localHandlers[slotName] = this._localHandlers[slotName] || {}
        this._localHandlers[slotName][param] = this._localHandlers[slotName][param] || []
        this._localHandlers[slotName][param].push(handler)

        /**
         * We notify the far end when adding the first handler only, as they
         * only need to know if at least one handler is connected.
         */
        if (this._localHandlers[slotName][param].length === 1) {
            const registrationMessage: TransportRegistrationMessage = {
                type: 'handler_registered',
                param,
                slotName
            }
            this._localHandlerRegistrations[param] =
                this._localHandlerRegistrations[param] || []

            this._localHandlerRegistrations[param].push(registrationMessage)

            if (this._channelReady) {
                this._channel.send(registrationMessage)
            }
        }
    }

    /**
     * Called when a local handler is unregistered, to send a `handler_unregistered`
     * message to the far end.
     */
    public unregisterHandler(
        slotName: string,
        param: string,
        handler: Handler<any, any>
    ): void {
        const slotLocalHandlers = this._localHandlers[slotName]
        if (slotLocalHandlers && slotLocalHandlers[param]) {
            const ix = slotLocalHandlers[param].indexOf(handler)
            if (ix > -1) {
                slotLocalHandlers[param].splice(ix, 1)
                /**
                 * We notify the far end when removing the last handler only, as they
                 * only need to know if at least one handler is connected.
                 */
                if (slotLocalHandlers[param].length === 0) {
                    const unregistrationMessage: TransportUnregistrationMessage = {
                        type: 'handler_unregistered',
                        param,
                        slotName
                    }
                    if (this._channelReady) {
                        this._channel.send(unregistrationMessage)
                    }
                }
            }
        }
    }

    /**
     * Allows to know the transport status and to perform a reconnection
     *
     * @returns {boolean} Transport's channel connection status, true if disconnected, otherwise false
     */
    public isDisconnected(): boolean {
        return !this._channelReady
    }

    /**
     * Auto-reconnect the channel
     * see Slot.trigger function for usage
     *
     * @returns {Promise} A promise resolving when the connection is established
     */
    public autoReconnect(): Promise<void> {
        if (this.isDisconnected() && this._channel.autoReconnect) {
            const promise = new Promise<void>((resolve) => {
                this._channel.onConnect(() => {
                    return resolve()
                })
            })
            this._channel.autoReconnect()

            return promise
        }

        return Promise.resolve()
    }
}
