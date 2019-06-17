import 'should'

import { Transport } from './../src/Transport'
import { TransportMessage } from './../src/Message'
import { TestChannel } from './TestChannel'
import * as sinon from 'sinon'
import { SinonSpy } from 'sinon'

const param = 'param'

describe('Transport', () => {

    context('subscriptions', () => {

        const channel = new TestChannel()
        const stubMethods: Array<keyof TestChannel> = ['onConnect', 'onDisconnect', 'onData', 'onError']
        stubMethods.forEach(method => sinon.stub(channel, method))
        new Transport(channel)

        stubMethods.forEach(methodName => it(`should subscribe to its channel\'s ${methodName} method`, () => {
            const method = channel[methodName] as any as sinon.SinonSpy
            method.called.should.be.True()
            method.restore()
        }))

    })

    context('handler registration, requests and unregistration', () => {

        let channel: TestChannel
        let transport: Transport
        let slots: { [slotName: string]: SinonSpy[] }

        beforeEach(() => {
            slots = {
                buildCelery: [sinon.spy(() => ({ color: 'blue' }))],
                getCarrotStock: [sinon.spy(), sinon.spy()]
            }
            channel = new TestChannel()
            transport = new Transport(channel)
            channel.callConnected()
        })

        it('should send a handler_registered message for each slot when a local handler is registered', () => {
            Object.keys(slots).forEach(slotName => {
                transport.registerHandler(slotName, param, slots[slotName][0])
                channel.sendSpy.calledWith({
                    type: 'handler_registered',
                    param,
                    slotName
                }).should.be.True()
            })
        })

        it('should not send a handler_registered message when an additional local handler is registered', () => {
            const slotName = 'getCarrotStock'
            transport.registerHandler(slotName, param, slots[slotName][0])
            transport.registerHandler(slotName, param, slots[slotName][1])
            channel.sendSpy
                .withArgs({ type: 'handler_registered', slotName, param })
                .calledOnce // should have been called exactly once
                .should.be.True()
        })


        it('should call the appropriate handler when a request is received', async () => {

            const slotName = 'buildCelery'
            const handler = slots[slotName][0]

            // Register handler on slot
            transport.registerHandler(slotName, param, handler)

            const request: TransportMessage = {
                type: 'request',
                slotName,
                id: '5',
                param,
                data: {
                    height: 5,
                    constitution: 'strong'
                }
            }

            channel.fakeReceive(request)

            await Promise.resolve() // yield to ts-event-bus internals
            handler.calledWith(request.data).should.be.True()
            channel.sendSpy.lastCall.args[0].should.eql({
                slotName,
                type: 'response',
                id: '5',
                param,
                data: {
                    color: 'blue'
                }
            })
        })

        it('should send a handler_unregistered message when the last local handler is unregistered', () => {

            const slotName = 'buildCelery'

            // Register one handler on slot
            transport.registerHandler(slotName, param, slots[slotName][0])

            // Unregister it
            transport.unregisterHandler(slotName, param, slots[slotName][0])

            channel.sendSpy.calledWith({
                type: 'handler_unregistered',
                param,
                slotName
            }).should.be.True()
        })

        it('should not call the unregistered handler when a request is received', async () => {

            const slotName = 'buildCelery'
            const handler = slots[slotName][0]

            // Register one handler on slot
            transport.registerHandler(slotName, param, handler)

            // Unregister it
            transport.unregisterHandler(slotName, param, slots[slotName][0])

            const request: TransportMessage = {
                type: 'request',
                slotName,
                id: '5',
                param,
                data: {
                    height: 5,
                    constitution: 'strong'
                }
            }
            channel.fakeReceive(request)
            await Promise.resolve() // yield to ts-event-bus internals
            handler.called.should.be.False()
        })

        it('should not send a handler_unregistered message when an additional local handler is unregistered', () => {

            const slotName = 'getCarrotStock'

            // Register two handlers on slot
            transport.registerHandler(slotName, param, slots[slotName][0])
            transport.registerHandler(slotName, param, slots[slotName][1])

            // Unregister one handler only
            transport.unregisterHandler(slotName, param, slots[slotName][0])

            channel.sendSpy.calledWith({
                type: 'handler_unregistered',
                slotName
            }).should.be.False()
        })

        context('adding, using and removing a remote handler', () => {

            const slotName = 'getCarrotStock'

            let addLocalHandler: SinonSpy
            let removeLocalHandler: SinonSpy
            let localHandler: (...args: any[]) => Promise<any>

            beforeEach(() => {
                addLocalHandler = sinon.spy()
                removeLocalHandler = sinon.spy()
                transport.addRemoteHandlerRegistrationCallback(slotName, addLocalHandler)
                channel.fakeReceive({ type: 'handler_registered', slotName, param })
                localHandler = addLocalHandler.lastCall.args[1]
            })

            it('should add a local handler when a remote handler registration is received', () => {
                addLocalHandler.called.should.be.True()
            })

            it('should resolve a local pending request when a response is received', async () => {
                const requestData = { carrotType: 'red' }
                const pendingPromise = localHandler(requestData)
                const request = channel.sendSpy.lastCall.args[0]
                request.should.match({
                    type: 'request',
                    slotName,
                    data: requestData
                })
                const responseData = 56
                channel.fakeReceive({
                    type: 'response',
                    id: request.id,
                    slotName,
                    param,
                    data: responseData
                })
                const response = await pendingPromise
                response.should.eql(responseData)
            })

            it('should reject a local pending request when an error is received', async () => {
                const pendingPromise = localHandler({ carrotType: 'blue' })
                const { id, param } = channel.sendSpy.lastCall.args[0]
                channel.fakeReceive({
                    type: 'error',
                    id,
                    param,
                    slotName,
                    message: 'all out of blue'
                })
                try {
                    await pendingPromise
                    throw new Error('Promise should have been rejected')
                }
                catch (err) {
                    `${err}`.should.eql('Error: all out of blue on getCarrotStock with param param')
                }
            })

            it('should remove a local handler when a remote handler unregistration is received', () => {
                transport.addRemoteHandlerUnregistrationCallback(slotName, removeLocalHandler)
                channel.fakeReceive({
                    type: 'handler_unregistered',
                    param,
                    slotName
                })
                removeLocalHandler.called.should.be.True()
            })
        })
    })
})
