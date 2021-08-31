import { Channel, OnMessageCallback } from '../Channel'
import { TransportMessage } from '../Message'

const DEFAULT_TIMEOUT = 5000
export abstract class GenericChannel implements Channel {

    public constructor(private _timeout = DEFAULT_TIMEOUT) { }

    get timeout() {
        return this._timeout
    }

    protected _onMessageCallbacks: OnMessageCallback[] = []
    private _onConnectCallbacks: Function[] = []
    private _onDisconnectCallbacks: Function[] = []
    private _onErrorCallbacks: Function[] = []
    private _ready = false

    public abstract send(message: TransportMessage): void

    /**
     * Allows to automatically reconnecting the channel when a slot is triggered but the connection is interrupted
     * Override this method to enable it
     */
    public autoReconnect(): void {}

    public onData(cb: OnMessageCallback): void {
        if (this._onMessageCallbacks.indexOf(cb) === -1) {
            this._onMessageCallbacks.push(cb)
        }
    }

    public onConnect(cb: Function): void {
        if (this._ready) {
            cb()
        }
        this._onConnectCallbacks.push(cb)
    }

    public onDisconnect(cb: Function): void {
        this._onDisconnectCallbacks.push(cb)
    }

    public onError(cb: Function): void {
        this._onErrorCallbacks.push(cb)
    }

    protected _messageReceived(message: TransportMessage) {
        this._onMessageCallbacks.forEach(cb => cb(message))
    }

    protected _error(error: any) {
        this._onErrorCallbacks.forEach(cb => cb(error))
    }

    protected _connected() {
        this._ready = true
        this._onConnectCallbacks.forEach(cb => cb())
    }

    protected _disconnected() {
        this._ready = false
        this._onDisconnectCallbacks.forEach(cb => cb())
    }
}

