import 'should'

import { TestChannel } from './TestChannel'
import * as sinon from 'sinon'

describe('GenericChannel', () => {

    it('should call onConnect subscribers when its _connected method is called', () => {
        const testInstance = new TestChannel()
        const spy = sinon.spy()
        testInstance.onConnect(spy)
        testInstance.callConnected()
        spy.called.should.be.True()
    })

    it('should call onDisconnect subscribers when its _disconnected method is called', () => {
        const testInstance = new TestChannel()
        const spy = sinon.spy()
        testInstance.onDisconnect(spy)
        testInstance.callDisconnected()
        spy.called.should.be.True()
    })

    it('should call onData callbacks when its _messageReceived method is called', () => {
        const testInstance = new TestChannel()
        const spy = sinon.spy()
        testInstance.onData(spy)
        testInstance.callMessageReceived()
        spy.called.should.be.True()
    })

    it('should call onError callbacks when its _error method is called', () => {
        const testInstance = new TestChannel()
        const spy = sinon.spy()
        testInstance.onError(spy)
        testInstance.callError()
        spy.called.should.be.True()
    })

})
