import 'should'

import { Transport } from './../src/Transport'
import { TransportMessage } from './../src/Message'
import { TestChannel } from './TestChannel'
import * as sinon from 'sinon'
import { createEventBus } from '../src/Events'
import { slot } from '../src/Slot'

describe('Transport', () => {

    context('subscriptions', () => {

        const channel = new TestChannel()
        const stubMethods: Array<keyof TestChannel> = ['onConnect', 'onDisconnect', 'onData', 'onError']
        stubMethods.forEach(method => sinon.stub(channel, method))
        const transport = new Transport(channel)

        stubMethods.forEach(methodName => it(`should subscribe to its channel\'s ${methodName} method`, () => {
            const method = channel[methodName] as any as sinon.SinonSpy
            method.called.should.be.True()
            method.restore()
        }))

    })

    context('handler registration, requests and unregistration', () => {

        const channel = new TestChannel()
        const transport = new Transport(channel)
        const handlers = {
            buildCelery: sinon.spy(() => ({ color: 'blue' })),
            getCarrotStock: sinon.spy()
        }

        it('should send a handler_registered message when a local handler is registered', () => {
            channel.callConnected()
            Object.keys(handlers).forEach(slotName => {
                transport.registerHandler(slotName, handlers[slotName])
                channel.sendSpy.calledWith({
                    type: 'handler_registered',
                    slotName
                }).should.be.True()
            })
        })

        it('should call the appropriate handler when a request is received', async () => {
            const slotName = 'buildCelery'
            const handler = handlers[slotName]
            handler.called.should.be.False()
            const request: TransportMessage = {
                type: 'request',
                slotName,
                id: '5',
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
                data: {
                    color: 'blue'
                }
            })
        })

        it('should send a handler_unregistered message when a local handler is unregistered', () => {
            Object.keys(handlers).forEach(slotName => {
                transport.unregisterHandler(slotName, handlers[slotName])
                channel.sendSpy.calledWith({
                    type: 'handler_unregistered',
                    slotName
                }).should.be.True()
            })
        })

        it('should not call the unregistered handler when a request is received', async () => {
            const slotName = 'buildCelery'
            const handler = handlers[slotName]
            const request: TransportMessage = {
                type: 'request',
                slotName,
                id: '5',
                data: {
                    height: 5,
                    constitution: 'strong'
                }
            }
            handler.resetHistory()
            channel.fakeReceive(request)
            await Promise.resolve() // yield to ts-event-bus internals
            handler.called.should.be.False()
        })

        context('adding, using and removing a remote handler', () => {

            const slotName = 'getCarrotStock'
            const addLocalHandler = sinon.spy()
            const removeLocalHandler = sinon.spy()
            let localHandler: (...args: any[]) => Promise<any>

            it('should add a local handler when a remote handler registration is received', () => {
                transport.onRemoteHandlerRegistered(slotName, addLocalHandler)
                channel.fakeReceive({
                    type: 'handler_registered',
                    slotName
                })
                addLocalHandler.called.should.be.True()
                localHandler = addLocalHandler.lastCall.args[0]
            })

            it('should resolve a local pending request when a response is received', () => {
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
                    data: responseData
                })
                return pendingPromise
                    .then((response: number) => response.should.eql(responseData))
            })

            it('should reject a local pending request when an error is received', () => {
                const pendingPromise = localHandler({ carrotType: 'blue' })
                const { id } = channel.sendSpy.lastCall.args[0]
                channel.fakeReceive({
                    type: 'error',
                    id,
                    slotName,
                    message: 'all out of blue'
                })
                return pendingPromise
                    .then(() => {
                        throw new Error('Promise should have been rejected')
                    })
                    .catch(err => `${err}`.should.eql('Error: all out of blue on getCarrotStock'))
            })

            it('should remove a local handler when a remote handler unregistration is received', () => {
                transport.onRemoteHandlerUnregistered(slotName, removeLocalHandler)
                channel.fakeReceive({
                    type: 'handler_unregistered',
                    slotName
                })
                removeLocalHandler.called.should.be.True()
            })
        })

    })

})
