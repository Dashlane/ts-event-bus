export type OnMessageCallback = (message: {}) => void

export interface Channel {
    timeout?: number
    send: (message: {}) => void
    onData: (cb: OnMessageCallback) => void
    onConnect: (cb: () => void) => void
    onDisconnect: (cb: () => void) => void
    onError?: (e: Error) => void
}

export abstract class GenericChannel implements Channel {

    public timeout?: number

    private _onMessageCallbacks: OnMessageCallback[] = []
    private _onConnectCallbacks: Function[] = []
    private _onDisconnectCallbacks: Function[] = []
    private _ready = false
    public onError: (e: Error) => void
    public abstract send(message: {}): void

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

    protected _messageReceived(message: {}) {
        this._onMessageCallbacks.forEach(cb => cb(message))
    }

    protected _error(error: any) {
        if (this.onError) {
            this.onError(error)
        }
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
