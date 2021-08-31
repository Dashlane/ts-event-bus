import { GenericChannel } from './../../src/Channels/GenericChannel'

export class WorkerChannel extends GenericChannel {

    constructor(private _worker: Worker, private _type: string) {
        super()
        this._connected()
        this._worker.addEventListener('message', ({ data }) => {
            if (!data || data.type !== this._type) {
                return
            }
            this._messageReceived(data.message)
        })
    }

    public send(message: {}): void {
        this._worker.postMessage({
            type: this._type,
            message
        })
    }
}
