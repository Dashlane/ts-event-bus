import 'should'
import { spy } from 'sinon'

import { connectSlot } from './../src/Slot'
import { TestChannel } from './TestChannel'
import { Transport } from './../src/Transport'

const makeTestTransport = () => {
    const channel = new TestChannel()
    const transport = new Transport(channel)
    channel.callConnected()
    return { channel, transport }
}

describe('connectSlot()', () => {

    context('with no transports', () => {

        it('should call the local handler if there is only one', () => {
            const numberToString = connectSlot<number, string>('numberToString', [])
            numberToString.on(num => num.toString())
            return numberToString(56)
                .then(res => res.should.eql('56'))
        })

        it('should call all handlers if there is more than one', async () => {
            const broadcastBool = connectSlot<boolean>('broadcastBool', [])
            const results: string[] = []
            broadcastBool.on(b => {
                results.push(`1:${b}`)
            })
            broadcastBool.on(b => {
                results.push(`2:${b}`)
            })
            broadcastBool.on(b => {
                results.push(`3:${b}`)
            })
            await broadcastBool(true)
            results.should.eql([
                '1:true',
                '2:true',
                '3:true'
            ])
        })

        it('should allow to unregister handlers', async () => {
            const broadcastNumber = connectSlot<number>('broadcastNumber', [])
            let results: number[] = []
            const runTest = (n: number) => {
                results = []
                return broadcastNumber(n)
            }

            // Add two handlers and save references to
            // the unsub function of the second
            broadcastNumber.on(n => {
                results.push(n - 1)
            })
            const unreg = broadcastNumber.on(n => {
                results.push(n - 2)
            })

            // Trigger the event once
            await runTest(5)

            // both handlers should have been called
            results.should.eql([4, 3])

            // unregister the second handler, then trigger
            // the event a second time: only the second handler
            // should be called
            unreg()
            await runTest(56)
            results.should.eql([55])
        })

        it('should call lazy connect and disconnect', () => {
            const broadcastBool = connectSlot<boolean>('broadcastBool', [])

            const connect = spy()
            const disconnect = spy()

            broadcastBool.lazy(connect, disconnect)

            const unsubscribe = broadcastBool.on(() => {})

            if (!connect.called) throw new Error('connect should have been called')
            if (disconnect.called) throw new Error('disconnect should not have been called')

            unsubscribe()

            if (!disconnect.called) throw new Error('disconnect should have been called')
        })

    })

    context('with local and remote handlers', () => {

        it('should call both local handlers and remote handlers', async () => {
            const {channel, transport} = makeTestTransport()
            const broadcastBool = connectSlot<boolean>('broadcastBool', [transport])
            let localCalled = false
            broadcastBool.on(b => { localCalled = true })
            const triggerPromise = broadcastBool(true)

            // Handlers should not be called until a remote handler is registered
            await Promise.resolve()
            localCalled.should.be.False()
            channel.fakeReceive({ type: 'handler_registered', slotName: 'broadcastBool'})

            // setTimeout(0) to yield control to ts-event-bus internals,
            // so that the call to handlers can be processed
            await new Promise(resolve => setTimeout(resolve, 0))

            // Once a remote handler is registered, both local and remote should be called
            localCalled.should.be.True()
            const request = channel.sendSpy.lastCall.args[0]
            request.should.match({
                type: 'request',
                slotName: 'broadcastBool',
                data: true
            })

            // triggerPromise should resolve once a remote response is received
            channel.fakeReceive({
                type: 'response',
                id: request.id,
                slotName: 'broadcastBool',
                data: null
            })
            await triggerPromise
        })

        describe('lazy', () => {
            it('should call connect and disconnect', () => {
                const { channel: channel1, transport: transport1 } = makeTestTransport()
                const { channel: channel2, transport: transport2 } = makeTestTransport()
                const broadcastBool = connectSlot<boolean>('broadcastBool', [transport1, transport2])

                const connect = spy()
                const disconnect = spy()

                broadcastBool.lazy(connect, disconnect)

                // Simulate two remote connextions to the slot
                channel1.fakeReceive({ type: 'handler_registered', slotName: 'broadcastBool'})
                channel2.fakeReceive({ type: 'handler_registered', slotName: 'broadcastBool'})

                // Connect should have been called once
                if (!connect.calledOnce) throw new Error('connect should have been called once')

                // Disconnect should not have been called
                if (disconnect.called) throw new Error('disconnect should not have been called')

                // Disconnect first remote client
                channel1.fakeReceive({ type: 'handler_unregistered', slotName: 'broadcastBool'})

                // Disconnect should not have been called
                if (disconnect.called) throw new Error('disconnect should not have been called')

                // Disconnect second remote client
                channel2.fakeReceive({ type: 'handler_unregistered', slotName: 'broadcastBool'})

                // Disconnect should have been called once
                if (!disconnect.calledOnce) throw new Error('disconnect should have been called once')
            })

            it('should support multiple lazy calls', () => {
                const { channel: channel1, transport: transport1 } = makeTestTransport()

                const connect1 = spy()
                const disconnect1 = spy()

                const connect2 = spy()
                const disconnect2 = spy()

                const broadcastBool = connectSlot<boolean>('broadcastBool', [transport1])

                broadcastBool.lazy(connect1, disconnect1)
                broadcastBool.lazy(connect2, disconnect2)

                channel1.fakeReceive({ type: 'handler_registered', slotName: 'broadcastBool'})

                // Connects should have been called once
                if (!connect1.calledOnce) throw new Error('connect1 should have been called once')
                if (!connect2.calledOnce) throw new Error('connect1 should have been called once')

                channel1.fakeReceive({ type: 'handler_unregistered', slotName: 'broadcastBool'})

                // Disonnects should have been called once
                if (!disconnect1.calledOnce) throw new Error('connect1 should have been called once')
                if (!disconnect2.calledOnce) throw new Error('connect1 should have been called once')
            })

            it('should call connect if transport was registered before lazy was called', () => {
                const { channel: channel1, transport: transport1 } = makeTestTransport()
                const broadcastBool = connectSlot<boolean>('broadcastBool', [transport1])

                const connect = spy()

                // Register remote handler *before* calling lazy
                channel1.fakeReceive({ type: 'handler_registered', slotName: 'broadcastBool'})

                broadcastBool.lazy(connect, () => {})

                // Connect should have been called once
                if (!connect.calledOnce) throw new Error('connect should have been called once')
            })

            it('should call disconnect on unsubscribe when remote client is connected', () => {
                const { channel: channel1, transport: transport1 } = makeTestTransport()
                const broadcastBool = connectSlot<boolean>('broadcastBool', [transport1])

                const disconnect = spy()

                // Register remote handler
                channel1.fakeReceive({ type: 'handler_registered', slotName: 'broadcastBool'})

                // Connect lazy
                const unsubscribe = broadcastBool.lazy(() => {}, disconnect)

                // Disonnect should not have been called
                if (disconnect.called) throw new Error('disconnect should not have been called')

                unsubscribe()

                // Disconnect should have been called once
                if (!disconnect.calledOnce) throw new Error('disconnect should have been called once')
            })
        })
    })
})
