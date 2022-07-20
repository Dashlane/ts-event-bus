import { connectSlot, slot, defaultSlotConfig } from './../src/Slot'
import { TestChannel } from './TestChannel'
import { Transport } from './../src/Transport'
import { DEFAULT_PARAM } from './../src/Constants'
import { TransportRegistrationMessage } from './../src/Message'

const makeTestTransport = () => {
    const channel = new TestChannel()
    const transport = new Transport(channel)
    channel.callConnected()
    return { channel, transport }
}

describe('slot', () => {
    it('should have a default config', () => {
        const testSlot = slot()
        if (!testSlot.config) {
            throw new Error('testSlot should have a config')
        }
        expect(testSlot.config).toEqual(defaultSlotConfig)
    })
    it('should set config passed as argument', () => {
        const config = { noBuffer: true }
        const testSlot = slot(config)
        if (!testSlot.config) {
            throw new Error('testSlot should have a config')
        }
        expect(testSlot.config).toEqual(config)
    })
})

describe('connectSlot', () => {
    describe('without parameter', () => {
        describe('trigger', () => {
            it('should use default parameter', async () => {
                const numberToString = connectSlot<number, string>('numberToString', [])
                numberToString.on(DEFAULT_PARAM, num => `${num.toString()}`)

                const res = await numberToString(56)
                expect(res).toEqual('56')
            })
        })

        describe('on', () => {
            it('should use default parameter', async () => {
                const numberToString = connectSlot<number, string>('numberToString', [])
                numberToString.on(num => `${num.toString()}`)

                const res = await numberToString(DEFAULT_PARAM, 56)
                expect(res).toEqual('56')
            })
        })
    })

    describe('with no transports', () => {
        it('should call a single local handler registered for a parameter', async () => {
            const numberToString = connectSlot<number, string>('numberToString', [])
            numberToString.on('a', num => `a${num.toString()}`)

            const res = await numberToString('a', 56)
            expect(res).toEqual('a56')
        })

        it('should call all handlers if there is more than one', async () => {
            const broadcastBool = connectSlot<boolean>('broadcastBool', [])
            const results: string[] = []

            broadcastBool.on('a', b => { results.push(`1:${b}`) })
            broadcastBool.on('a', b => { results.push(`2:${b}`) })
            broadcastBool.on('a', b => { results.push(`3:${b}`) })

            // Should not be called: different parameter
            broadcastBool.on('b', b => { results.push(`4:${b}`) })

            await broadcastBool('a', true)

            expect(results).toEqual(['1:true', '2:true', '3:true'])
        })

        it('should allow subscribing to multiple parameters', async () => {
            const broadcastBool = connectSlot<number>('broadcastBool', [])
            let value = 0

            broadcastBool.on('add', n => { value += n })
            broadcastBool.on('remove', n => { value -= n })

            await broadcastBool('add', 3)
            expect(value).toEqual(3)

            await broadcastBool('remove', 2)
            expect(value).toEqual(1)
        })

        it('should allow to unregister handlers', async () => {
            const broadcastBool = connectSlot<number>('broadcastBool', [])
            let value = 0

            const unsub = broadcastBool.on('add', n => { value += n })
            broadcastBool.on('add', n => { value += n })

            await broadcastBool('add', 3)
            expect(value).toEqual(6) // 2 * 3

            unsub()

            await broadcastBool('add', 3)
            expect(value).toEqual(9) // 6 + 1 * 3
        })

        it('should call lazy connect and disconnect with parameter', () => {
            const broadcastBool = connectSlot<boolean>('broadcastBool', [])

            const param = 'param'

            const connect = jest.fn()
            const disconnect = jest.fn()

            broadcastBool.lazy(connect, disconnect)

            const unsubscribe = broadcastBool.on(param, () => { })

            expect(connect).toHaveBeenCalledWith(param)
            expect(disconnect).not.toHaveBeenCalled()
            unsubscribe()
            expect(disconnect).toHaveBeenCalled()
        })
    })

    describe('with local and remote handlers', () => {
        it('should call both local handlers and remote handlers', async () => {
            const { channel, transport } = makeTestTransport()
            const broadcastBool = connectSlot<boolean>('broadcastBool', [transport])
            let localCalled = false
            broadcastBool.on(_b => { localCalled = true })
            const triggerPromise = broadcastBool(true)

            // Handlers should not be called until a remote handler is registered
            await Promise.resolve()

            expect(localCalled).toEqual(false)

            channel.fakeReceive({
                param: DEFAULT_PARAM,
                slotName: 'broadcastBool',
                type: 'handler_registered'
            })

            // setTimeout(0) to yield control to ts-event-bus internals,
            // so that the call to handlers can be processed
            await new Promise(resolve => setTimeout(resolve, 0))

            // Once a remote handler is registered, both local and remote should be called
            expect(localCalled).toEqual(true)
            const request = channel.sendSpy.mock.calls[channel.sendSpy.mock.calls.length - 1][0]

            expect(request).toMatchObject({
                data: true,
                param: DEFAULT_PARAM,
                slotName: 'broadcastBool',
                type: 'request'
            })

            // triggerPromise should resolve once a remote response is received
            channel.fakeReceive({
                data: null,
                id: request.id,
                param: DEFAULT_PARAM,
                slotName: 'broadcastBool',
                type: 'response'
            })
            await triggerPromise
        })

        describe('noBuffer', () => {
            it('should call local handlers even if no remote handler is registered', async () => {
                const { channel, transport } = makeTestTransport()
                const broadcastBool = connectSlot<boolean>(
                    'broadcastBool',
                    [transport],
                    { noBuffer: true }
                )
                let localCalled = false
                broadcastBool.on(_b => { localCalled = true })
                await broadcastBool(true)

                // We should have called the trigger
                expect(localCalled).toEqual(true)

                const registrationMessage: TransportRegistrationMessage = {
                    param: DEFAULT_PARAM,
                    slotName: 'broadcastBool',
                    type: 'handler_registered'
                }

                channel.fakeReceive(registrationMessage)
                await new Promise(resolve => setTimeout(resolve, 0))

                // Remote should not have been called, as it was not registered
                // at the time of the trigger.
                const request = channel.sendSpy.mock.calls[0]
                expect(request).toMatchObject(request)
            })
        })

        describe('lazy', () => {
            it('should call connect and disconnect', () => {
                const param = 'param'

                const { channel: channel1, transport: transport1 } = makeTestTransport()
                const { channel: channel2, transport: transport2 } = makeTestTransport()

                const broadcastBool = connectSlot<boolean>(
                    'broadcastBool',
                    [transport1, transport2]
                )

                const connect = jest.fn()
                const disconnect = jest.fn()

                broadcastBool.lazy(connect, disconnect)

                // Simulate two remote connextions to the slot
                channel1.fakeReceive({
                    type: 'handler_registered',
                    slotName: 'broadcastBool',
                    param
                })

                channel2.fakeReceive({
                    type: 'handler_registered',
                    slotName: 'broadcastBool',
                    param
                })

                // Connect should have been called once
                expect(connect).toHaveBeenCalledWith(param)

                // Disconnect should not have been called
                expect(disconnect).not.toHaveBeenCalled()

                // Disconnect first remote client
                channel1.fakeReceive({
                    type: 'handler_unregistered',
                    slotName: 'broadcastBool',
                    param
                })

                // Disconnect should not have been called
                expect(disconnect).not.toHaveBeenCalled()

                // Disconnect second remote client
                channel2.fakeReceive({
                    type: 'handler_unregistered',
                    slotName: 'broadcastBool',
                    param
                })

                // Disconnect should have been called once
                expect(disconnect).toHaveBeenCalledWith(param)
            })

            it('should support multiple lazy calls', () => {
                const { channel: channel1, transport: transport1 } = makeTestTransport()

                const param = 'param'

                const connect1 = jest.fn()
                const disconnect1 = jest.fn()

                const connect2 = jest.fn()
                const disconnect2 = jest.fn()

                const broadcastBool = connectSlot<boolean>(
                    'broadcastBool',
                    [transport1]
                )

                broadcastBool.lazy(connect1, disconnect1)
                broadcastBool.lazy(connect2, disconnect2)

                channel1.fakeReceive({
                    type: 'handler_registered',
                    slotName: 'broadcastBool',
                    param
                })

                // Connects should have been called once
                expect(connect1).toHaveBeenCalledWith(param)
                expect(connect2).toHaveBeenCalledWith(param)

                channel1.fakeReceive({
                    type: 'handler_unregistered',
                    slotName: 'broadcastBool',
                    param
                })

                expect(disconnect1).toHaveBeenCalledWith(param)
                expect(disconnect2).toHaveBeenCalledWith(param)
            })

            it('should call connect if transport was registered before lazy was called', () => {
                const param = 'param'
                const { channel: channel1, transport: transport1 } = makeTestTransport()
                const broadcastBool = connectSlot<boolean>('broadcastBool', [transport1])

                const connect = jest.fn()

                // Register remote handler *before* calling lazy
                channel1.fakeReceive({
                    type: 'handler_registered',
                    slotName: 'broadcastBool',
                    param
                })

                broadcastBool.lazy(connect, () => { })

                expect(connect).toHaveBeenCalledWith(param, 0, [param])
            })
        })
    })

    describe('with two remote endpoints: A and B', () => {
        describe('no event list sent by any endpoints', () => {
            it('should wait for all remote endpoints to have signaled registration before sending the event', async () => {
                const { channel: channelA, transport: transportA } =
                    makeTestTransport()
                const { channel: channelB, transport: transportB } =
                    makeTestTransport()
                const broadcastBool = connectSlot<boolean>('broadcastBool', [
                    transportA,
                    transportB,
                ])

                broadcastBool(true)

                await new Promise((resolve) => setTimeout(resolve, 0))

                expect(channelA.sendSpy.mock.calls.length).toBe(0)
                expect(channelB.sendSpy.mock.calls.length).toBe(0)

                // Endpoint A signals registration
                channelA.fakeReceive({
                    param: DEFAULT_PARAM,
                    slotName: 'broadcastBool',
                    type: 'handler_registered',
                })

                await new Promise((resolve) => setTimeout(resolve, 0))

                expect(channelA.sendSpy.mock.calls.length).toBe(0)
                expect(channelB.sendSpy.mock.calls.length).toBe(0)

                // Endpoint B signals registration
                channelB.fakeReceive({
                    param: DEFAULT_PARAM,
                    slotName: 'broadcastBool',
                    type: 'handler_registered',
                })
                await new Promise((resolve) => setTimeout(resolve, 0))

                expect(channelA.sendSpy.mock.calls.length).toBe(1)
                expect(channelB.sendSpy.mock.calls.length).toBe(1)

                const messageToA =
                    channelA.sendSpy.mock.calls[
                        channelA.sendSpy.mock.calls.length - 1
                    ][0]
                expect(messageToA).toMatchObject({
                    data: true,
                    param: DEFAULT_PARAM,
                    slotName: 'broadcastBool',
                    type: 'request',
                })

                const messageToB =
                    channelB.sendSpy.mock.calls[
                        channelB.sendSpy.mock.calls.length - 1
                    ][0]
                expect(messageToB).toMatchObject({
                    data: true,
                    param: DEFAULT_PARAM,
                    slotName: 'broadcastBool',
                    type: 'request',
                })
            })
        })

        describe('a blacklist is sent to one endpoint (A)', () => {
            it('should NOT wait for remote endpoint A but SHOULD wait on remote endpoint B to have signaled registration before sending the event', async () => {
                const { channel: channelA, transport: transportA } =
                    makeTestTransport()
                const { channel: channelB, transport: transportB } =
                    makeTestTransport()

                const broadcastBool = connectSlot<boolean>('broadcastBool', [
                    transportA,
                    transportB,
                ])

                // Receiving a black list of events
                channelA.fakeReceive({
                    type: 'event_list',
                    blackList: ['broadcastBool'],
                })

                // This will be called only when B is ready we don't care about
                // A as his event white list is empty
                let called = false
                broadcastBool.on((_b) => {
                    called = true
                })

                broadcastBool(true)

                await new Promise((resolve) => setTimeout(resolve, 0))

                // Should not fire as there B is not registered
                expect(called).toBe(false)

                // Endpoint B signals registration
                channelB.fakeReceive({
                    param: DEFAULT_PARAM,
                    slotName: 'broadcastBool',
                    type: 'handler_registered',
                })
                await new Promise((resolve) => setTimeout(resolve, 0))

                expect(called).toBe(true)
            })
        })

        describe('an empty blacklist is sent to one endpoint (A)', () => {
            // This is the same test as before. But this time the because the
            // blackList is empty, we need to wait for A AND B to be registered
            // to trigger the event
            it('should wait for remote endpoint A and remote endpoint B to have signaled registration before sending the event', async () => {
                const { channel: channelA, transport: transportA } =
                    makeTestTransport()
                const { channel: channelB, transport: transportB } =
                    makeTestTransport()

                const broadcastBool = connectSlot<boolean>('broadcastBool', [
                    transportA,
                    transportB,
                ])

                // This will be called only when A and B are ready
                let called = false
                broadcastBool.on((_b) => {
                    called = true
                })

                channelA.fakeReceive({
                    type: 'event_list',
                    blackList: [],
                })

                broadcastBool(true)

                await new Promise((resolve) => setTimeout(resolve, 0))

                // Should not fire as none of A and B are registered
                expect(called).toBe(false)

                // Endpoint A signals registration
                channelA.fakeReceive({
                    param: DEFAULT_PARAM,
                    slotName: 'broadcastBool',
                    type: 'handler_registered',
                })

                // Should not fire as there B is not registered
                expect(called).toBe(false)

                // Endpoint B signals registration
                channelB.fakeReceive({
                    param: DEFAULT_PARAM,
                    slotName: 'broadcastBool',
                    type: 'handler_registered',
                })
                await new Promise((resolve) => setTimeout(resolve, 0))

                // Should fire as A and B are registered
                expect(called).toBe(true)
            })
        })
    })
})
