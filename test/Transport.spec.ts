import { Transport } from './../src/Transport'
import { TransportMessage } from './../src/Message'
import { TestChannel } from './TestChannel'

const param = 'param'

describe('Transport', () => {

    describe('subscriptions', () => {

        const channel = new TestChannel()
        const stubMethods: Array<keyof TestChannel> = ['onConnect', 'onDisconnect', 'onData', 'onError']
        // tslint:disable-next-line
        stubMethods.forEach(method => { Object.defineProperty(channel, method, { value: jest.fn() }) });

        // tslint:disable-next-line
        new Transport(channel)

        stubMethods.forEach(methodName => {
            it(`should subscribe to its channel\'s ${methodName} method`, () => {
                expect(channel[methodName]).toHaveBeenCalled()
            })
        })

    })

    describe('handler registration, requests and unregistration', () => {

        let channel: TestChannel
        let transport: Transport
        let slots: { [slotName: string]: jest.Mock[] }

        beforeEach(() => {
            jest.resetAllMocks()
            slots = {
                buildCelery: [jest.fn(() => ({ color: 'blue' }))],
                getCarrotStock: [jest.fn(), jest.fn()]
            }
            channel = new TestChannel()
            transport = new Transport(channel)
            channel.callConnected()
        })

        it('should send a handler_registered message for each slot when a local handler is registered', () => {
            Object.keys(slots).forEach(slotName => {
                transport.registerHandler(slotName, param, slots[slotName][0])
                expect(channel.sendSpy).toHaveBeenCalledWith({
                    type: 'handler_registered',
                    param,
                    slotName
                })
            })
        })

        it('should not send a handler_registered message when an additional local handler is registered', () => {
            const slotName = 'getCarrotStock'
            transport.registerHandler(slotName, param, slots[slotName][0])
            transport.registerHandler(slotName, param, slots[slotName][1])
            expect(channel.sendSpy).toHaveBeenCalledWith({ type: 'handler_registered', slotName, param })
        })

        it('should not send a handler_unregistered message when an additional local handler is unregistered', () => {
            const slotName = 'getCarrotStock'
            transport.registerHandler(slotName, param, slots[slotName][0])
            transport.registerHandler(slotName, param, slots[slotName][1])
            transport.unregisterHandler(slotName, param, slots[slotName][1])
            expect(channel.sendSpy).not.toHaveBeenCalledWith({ type: 'handler_unregistered', slotName, param })
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
            expect(handler).toHaveBeenCalledWith(request.data)
            expect(channel.sendSpy).toHaveBeenLastCalledWith({
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

            expect(channel.sendSpy).toHaveBeenCalledWith({
                type: 'handler_unregistered',
                param,
                slotName
            })
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
            expect(handler).not.toHaveBeenCalled()
        })

        it('should not send a handler_unregistered message when an additional local handler is unregistered', () => {

            const slotName = 'getCarrotStock'

            // Register two handlers on slot
            transport.registerHandler(slotName, param, slots[slotName][0])
            transport.registerHandler(slotName, param, slots[slotName][1])

            // Unregister one handler only
            transport.unregisterHandler(slotName, param, slots[slotName][0])

            expect(channel.sendSpy).not.toHaveBeenCalledWith({
                type: 'handler_unregistered',
                slotName
            })
        })

        describe('adding, using and removing a remote handler', () => {

            const slotName = 'getCarrotStock'

            let addLocalHandler: jest.Mock
            let removeLocalHandler: jest.Mock
            let localHandler: (...args: any[]) => Promise<any>

            beforeEach(() => {
                addLocalHandler = jest.fn()
                removeLocalHandler = jest.fn()
                transport.addRemoteHandlerRegistrationCallback(slotName, addLocalHandler)
                channel.fakeReceive({ type: 'handler_registered', slotName, param })
                localHandler = addLocalHandler.mock.calls[addLocalHandler.mock.calls.length - 1][1]
            })

            it('should add a local handler when a remote handler registration is received', () => {
                expect(addLocalHandler).toHaveBeenCalled()
            })

            it('should resolve a local pending request when a response is received', async () => {
                const requestData = { carrotType: 'red' }
                const pendingPromise = localHandler(requestData)
                const request = channel.sendSpy.mock.calls[channel.sendSpy.mock.calls.length - 1][0]
                expect(request).toMatchObject({
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
                expect(response).toEqual(responseData)
            })

            it('should reject a local pending request when an error is received', async () => {
                const pendingPromise = localHandler({ carrotType: 'blue' })
                const { id, param } = channel.sendSpy.mock.calls[channel.sendSpy.mock.calls.length - 1][0]
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
                    expect(`${err}`).toEqual('Error: all out of blue on getCarrotStock with param param')
                }
            })

            it('should remove a local handler when a remote handler unregistration is received', () => {
                transport.addRemoteHandlerUnregistrationCallback(slotName, removeLocalHandler)
                channel.fakeReceive({
                    type: 'handler_unregistered',
                    param,
                    slotName
                })
                expect(removeLocalHandler).toHaveBeenCalled()
            })

            it('should unregister all remote handlers when channel gets disconnected', () => {
                // Add remote handler unregistration callback
                transport.addRemoteHandlerUnregistrationCallback(slotName, removeLocalHandler)

                // Disconnect channel
                channel.callDisconnected()

                // Callback should have been called
                expect(removeLocalHandler).toHaveBeenCalled()
            })
        })
    })

    describe('channel connection status', () => {

        let channel: TestChannel
        let transport: Transport

        beforeEach(() => {
            jest.resetAllMocks()
            channel = new TestChannel()
            transport = new Transport(channel)
            channel.callConnected()
        })

        it('should be indicated as connected', () => {
            expect(transport.isDisconnected()).toEqual(false)
        })

        it('should be indicated as disconnected', () => {
            // Disconnect channel
            channel.callDisconnected()

            expect(transport.isDisconnected()).toEqual(true)
        })

    })

    describe('channel autoreconnect', () => {

        let channel: TestChannel
        let transport: Transport

        beforeEach(() => {
            jest.resetAllMocks()
            channel = new TestChannel()
            transport = new Transport(channel)
        })

        describe('when already connected', () => {
            beforeEach(() => {
                jest.resetAllMocks()
                channel.autoReconnectSpy.mockClear()
                channel.callConnected()
            })

            it('should not call the channel autoReconnect method', () => {
                transport.autoReconnect()
                expect(channel.autoReconnectSpy).not.toHaveBeenCalled()
            })

            it('should not call the channel onConnect method', () => {
                Object.defineProperty(channel, 'onConnect', { value: jest.fn() })
                transport.autoReconnect()

                expect(channel['onConnect']).not.toHaveBeenCalled()
            })
        })

        describe('when disconnected', () => {
            beforeEach(() => {
                jest.resetAllMocks()
                channel.autoReconnectSpy.mockClear()
                channel.callDisconnected()
            })

            it('should call the channel autoReconnect method', () => {
                transport.autoReconnect()
                expect(channel.autoReconnectSpy).toHaveBeenCalled()
            })

            it('should call the channel onConnect method', () => {
                Object.defineProperty(channel, 'onConnect', { value: jest.fn() })
                transport.autoReconnect()

                expect(channel['onConnect']).toHaveBeenCalledTimes(1)
            })

        })
    })
})
