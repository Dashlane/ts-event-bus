import 'should'

import {slot} from './../src/Slot'
import {combineEvents, createEventBus} from './../src/Events'
// import {TransportMessage} from './../src/Message'
import {TestChannel} from './TestChannel'
import { DEFAULT_PARAM } from './../src/Constants'
import * as sinon from 'sinon'

describe('combineEvents()', () => {

    it('should correctly combine several EventDeclarations', () => {
        const combined = combineEvents(
            {
                hello: slot<{ name: string }>()
            },
            {
                how: slot<{ mode: 'simple' | 'advanced'}>(),
                are: slot<{ tense: number }>()
            },
            {
                you: slot<{ reflective: boolean }>()
            }
        )
        Object.keys(combined).should.eql(['hello', 'how', 'are', 'you'])

        // Uncomment the following to check that combineEvents
        // does preserve each slot's typings: they contain type errors
        // combined.hello({ name: 5 })
        // combined.how({ mode: 'smiple' })
        // combined.are({ tense: true })
        // combined.you({ reflective: 5 })
    })

})

describe('createEventBus()', () => {

    const events = {
        numberToString: slot<number, string>()
    }

    const param = DEFAULT_PARAM

    it('should correctly create an event bus with no channels', async () => {

        // Attempting to use the events without having
        // created an event bus fails
        const bad = () => events.numberToString(5)
        bad.should.throw(/Slot not connected/)

        // After creating an event bus, events can be
        // subscribed to and triggered
        const eventBus = createEventBus({ events })
        eventBus.numberToString.on(num => num.toString())
        const res = await eventBus.numberToString(5)
        res.should.eql('5')
    })

    it('should connect the channels passed as argument', async () => {

        const channel = new TestChannel()
        const eventBus = createEventBus({
            events,
            channels: [ channel ]
        })
        channel.callConnected()

        // When a handler is added locally, a message should be
        // sent through the Channel to signal the registration
        eventBus.numberToString.on(num => num.toString())
        channel.sendSpy.calledWith({
            type: 'handler_registered',
            param,
            slotName: 'numberToString'
        }).should.be.True()

        // When a request is sent from the Channel, it should
        // be treated and a message sent in response
        channel.fakeReceive({
            type: 'request',
            slotName: 'numberToString',
            param,
            id: '0',
            data: 5
        })

        await Promise.resolve() // yied to ts-event-bus internals
        channel.sendSpy.calledWith({
            type: 'response',
            slotName: 'numberToString',
            param,
            id: '0',
            data: '5'
        }).should.be.True()
    })
})
