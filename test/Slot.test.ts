import 'should'
import { spy } from 'sinon'

import { connectSlot } from './../src/Slot'
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

describe('connectSlot', () => {

    context('without parameter', () => {

        describe('trigger', () => {
            it('should use default parameter', async () => {
                const numberToString = connectSlot<number, string>('numberToString', [])
                numberToString.on(DEFAULT_PARAM, num => `${num.toString()}`)

                const res = await numberToString(56)
                res.should.eql('56')
            })
        })

        describe('on', () => {
            it('should use default parameter', async () => {
                const numberToString = connectSlot<number, string>('numberToString', [])
                numberToString.on(num => `${num.toString()}`)

                const res = await numberToString(DEFAULT_PARAM, 56)
                res.should.eql('56')
            })
        })
    })

    context('with no transports', () => {

        it('should call a single local handler registered for a parameter', async () => {
            const numberToString = connectSlot<number, string>('numberToString', [])
            numberToString.on('a', num => `a${num.toString()}`)

            const res = await numberToString('a', 56)
            res.should.eql('a56')
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

            results.should.eql([ '1:true', '2:true', '3:true' ])
        })

        it('should allow subscribing to multiple parameters', async () => {
            const broadcastBool = connectSlot<number>('broadcastBool', [])
            let value = 0

            broadcastBool.on('add', n => { value += n })
            broadcastBool.on('remove', n => { value -= n })

            await broadcastBool('add', 3)
            value.should.eql(3)

            await broadcastBool('remove', 2)
            value.should.eql(1)
        })

        it('should allow to unregister handlers', async () => {
            const broadcastBool = connectSlot<number>('broadcastBool', [])
            let value = 0

            const unsub = broadcastBool.on('add', n => { value += n })
            broadcastBool.on('add', n => { value += n })

            await broadcastBool('add', 3)
            value.should.eql(6) // 2 * 3

            unsub()

            await broadcastBool('add', 3)
            value.should.eql(9) // 6 + 1 * 3
        })

        it('should call lazy connect and disconnect with parameter', () => {
            const broadcastBool = connectSlot<boolean>('broadcastBool', [])

            const param = 'param'

            const connect = spy()
            const disconnect = spy()

            broadcastBool.lazy(connect, disconnect)

            const unsubscribe = broadcastBool.on(param, () => {})

            if (!connect.calledWith(param))
                throw new Error('connect should have been called with parameter')

            if (disconnect.called)
                throw new Error('disconnect should not have been called with parameter')

            unsubscribe()

            if (!disconnect.calledWith(param))
                throw new Error('disconnect should have been called with parameter')
        })
    })

    context('with local and remote handlers', () => {

        it('should call both local handlers and remote handlers', async () => {
            const { channel, transport } = makeTestTransport()
            const broadcastBool = connectSlot<boolean>('broadcastBool', [transport])
            let localCalled = false
            broadcastBool.on(_b => { localCalled = true })
            const triggerPromise = broadcastBool(true)

            // Handlers should not be called until a remote handler is registered
            await Promise.resolve()
            localCalled.should.be.False()

            channel.fakeReceive({
                param: DEFAULT_PARAM,
                slotName: 'broadcastBool',
                type: 'handler_registered'
            })

            // setTimeout(0) to yield control to ts-event-bus internals,
            // so that the call to handlers can be processed
            await new Promise(resolve => setTimeout(resolve, 0))

            // Once a remote handler is registered, both local and remote should be called
            localCalled.should.be.True()
            const request = channel.sendSpy.lastCall.args[0]

            request.should.match({
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
                broadcastBool(true)

                // We should have called the trigger
                localCalled.should.be.True()

                const registrationMessage: TransportRegistrationMessage = {
                    param: DEFAULT_PARAM,
                    slotName: 'broadcastBool',
                    type: 'handler_registered'
                }

                channel.fakeReceive(registrationMessage)
                await new Promise(resolve => setTimeout(resolve, 0))

                // Remote should not have been called, as it was not registered
                // at the time of the trigger.
                const request = channel.sendSpy.lastCall.args[0]
                request.should.match(registrationMessage)
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

                const connect = spy()
                const disconnect = spy()

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
                if (!connect.calledOnceWith(param))
                    throw new Error('connect should have been called once with param')

                // Disconnect should not have been called
                if (disconnect.called)
                    throw new Error('disconnect should not have been called')

                // Disconnect first remote client
                channel1.fakeReceive({
                    type: 'handler_unregistered',
                    slotName: 'broadcastBool',
                    param
                })

                // Disconnect should not have been called
                if (disconnect.called)
                    throw new Error('disconnect should not have been called')

                // Disconnect second remote client
                channel2.fakeReceive({
                    type: 'handler_unregistered',
                    slotName: 'broadcastBool',
                    param
                })

                // Disconnect should have been called once
                if (!disconnect.calledOnceWith(param))
                    throw new Error('disconnect should have been called once with param')
            })

            it('should support multiple lazy calls', () => {
                const { channel: channel1, transport: transport1 } = makeTestTransport()

                const param = 'param'

                const connect1 = spy()
                const disconnect1 = spy()

                const connect2 = spy()
                const disconnect2 = spy()

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
                if (!connect1.calledOnceWith(param))
                    throw new Error('connect1 should have been called once with param')

                if (!connect2.calledOnceWith(param))
                    throw new Error('connect2 should have been called once with param')

                channel1.fakeReceive({
                    type: 'handler_unregistered',
                    slotName: 'broadcastBool',
                    param
                })

                // Disonnects should have been called once
                if (!disconnect1.calledOnceWith(param))
                    throw new Error('disconnect1 should have been called once with param')

                if (!disconnect2.calledOnceWith(param))
                    throw new Error('disconnect2 should have been called once with param')
            })

            it('should call connect if transport was registered before lazy was called', () => {
                const param = 'param'
                const { channel: channel1, transport: transport1 } = makeTestTransport()
                const broadcastBool = connectSlot<boolean>('broadcastBool', [transport1])

                const connect = spy()

                // Register remote handler *before* calling lazy
                channel1.fakeReceive({
                    type: 'handler_registered',
                    slotName: 'broadcastBool',
                    param
                })

                broadcastBool.lazy(connect, () => {})

                // Connect should have been called once
                if (!connect.calledOnceWith(param))
                    throw new Error('connect should have been called once with param')
            })
        })
    })
})
