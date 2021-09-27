import * as WebSocket from 'ws'
import { Server as WebSocketServer } from 'ws'
import { GenericChannel } from './../../src/Channels/GenericChannel'

export class WebSocketClientChannel extends GenericChannel {

    private static _MAX_RETRIES = 3
    private _tries = 0
    private _ws: WebSocket | null

    constructor(private _host: string) {
        super()
        this._init()
    }

    private _init(): void {
        if (++this._tries === WebSocketClientChannel._MAX_RETRIES) {
            return
        }
        const reinit = () => {
            this._disconnected()
            this._ws = null
            this._init()
        }
        let ws: WebSocket | null = null
        try {
            ws = new WebSocket(this._host)
        } catch (err) {
            setTimeout(() => this._init, 500)
        }
        (ws as WebSocket).on('open', () => {
            this._ws = ws as WebSocket
            this._ws.on('close', reinit)
            this._ws.on('error', e => {
                this._error(e)
                reinit()
            })
            this._ws.on('message', (message: string) => {
                let parsedData
                try {
                    parsedData = JSON.parse(message)
                } catch (err) {
                    return
                }
                this._messageReceived(parsedData)
            })
            this._connected()
        })
    }

    send(message: {}) {
        if (!this._ws) {
            return
        }
        this._ws.send(JSON.stringify(message))
    }
}

export class WebSocketServerChannel extends GenericChannel {
    private static _MAX_RETRIES = 3
    private _tries = 0
    private _ws: WebSocket | null

    constructor(private _port: number) {
        super()
        this._init()
    }

    private _init(): void {
        if (++this._tries === WebSocketServerChannel._MAX_RETRIES) {
            return
        }
        const server = new WebSocketServer({ port: this._port })
        const reinit = () => {
            this._disconnected()
            this._ws = null
            server.close(() => {
                this._init()
            })
        }
        server.on('connection', ws => {
            this._ws = ws
            this._ws.on('close', reinit)
            this._ws.on('error', e => {
                this._error(e)
                reinit()
            })
            this._ws.on('message', (message: string) => {
                let parsedData
                try {
                    parsedData = JSON.parse(message)
                } catch (err) {
                    this._error(err)
                    return
                }
                this._messageReceived(parsedData)
            })
            this._connected()
        })
    }

    send(message: {}) {
        if (!this._ws) {
            return
        }
        this._ws.send(JSON.stringify(message))
    }
}
