import {GenericChannel} from './../src/Channel'
import {TransportMessage} from './../src/Transport'
import * as sinon from 'sinon'

export class TestChannel extends GenericChannel {

    public sendSpy = sinon.spy()

    constructor(public timeout?: number) {
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
        this._messageReceived({ type: 'test' })
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
