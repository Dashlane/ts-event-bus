import { GenericChannel } from './../../src/Channel'

export class WebSocketClientChannel extends GenericChannel {
    private static MAX_RETRIES = 3

    private _ws: WebSocket | null = null

    constructor(private _host: string) {
        super()
        this._tryToConnect()
    }

    public send(message: {}): void {
        if (!this._ws) {
            return
        }
        const stringified = JSON.stringify(message)
        this._ws.send(stringified)
    }

    private _tryToConnect(attemptsLeft: number = WebSocketClientChannel.MAX_RETRIES): void {
        this._init(attemptsLeft)
    }

    private _onWsMessage(data: string): void {
        let parsedData: any
        try {
            parsedData = JSON.parse(data)
        } catch (err) {
            this._error(err)
            return
        }
        this._messageReceived(parsedData)
    }

    private _init(attemptsLeft: number): void {
        if (attemptsLeft === 0) {
            return
        }

        const ws = new WebSocket(this._host)

        ws.onopen = (e: Event) => {
            this._connected()
            this._ws = ws
        }

        ws.onerror = (e: Event) => {
            this._ws = null
            this._error(e)
            this._disconnected()
            setTimeout(() => {
                this._tryToConnect(attemptsLeft - 1)
            }, 1500)
        }

        ws.onclose = (e: CloseEvent) => {
            if (ws === this._ws) {
                this._ws = null
                this._disconnected()
                this._tryToConnect()
            }
        }

        ws.onmessage = (e: MessageEvent) => {
            this._onWsMessage(e.data)
        }
    }
}
