import * as sinon from 'sinon'
import { ChunkedChannel } from './../src/Channels/ChunkedChannel'
import { GenericChannel } from './../src/Channels/GenericChannel'
import { TransportMessage } from './../src/Message'
import { DEFAULT_PARAM } from './../src/Constants'

export class TestChannel extends GenericChannel {

    public sendSpy = sinon.spy()

    constructor() {
        super()
    }

    /**
     * Allows to inspect calls to Channel.send() by a transport
     */

    public callConnected() {
        this._connected()
    }

    public callDisconnected() {
        this._disconnected()
    }

    public callMessageReceived()  {
        this._messageReceived({
            type: 'error',
            slotName: 'test',
            param: DEFAULT_PARAM,
            id: '1',
            message: 'error'
        })
    }

    public callError() {
        this._error(new Error('LOLOL'))
    }

    public send(message: TransportMessage) {
        this.sendSpy(message)
    }

    /**
     * Allows to fake reception of messages from the far end
     */
    public fakeReceive(message: TransportMessage) {
        this._messageReceived(message)
    }

}

export class TestChunkedChannel extends ChunkedChannel {
    public sendSpy = sinon.spy()
    public dataSpy = sinon.spy()

    constructor(chunkSize: number, stringAlloc = -1) {
        super({
            chunkSize,
            sender: null as any,
            maxStringAlloc: stringAlloc
        })
        this._sender = m => {
            this.sendSpy(m)
            this._messageReceived(m)
        }

        this.onData(this.dataSpy)
        this._connected()
    }
}
