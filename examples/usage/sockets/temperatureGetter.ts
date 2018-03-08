import { createEventBus } from './../../../src'
import Events from './events'
import { WebSocketServerChannel } from './../../channels/WebSocket'

const EventBus = createEventBus({
    events: Events,
    channels: [
        new WebSocketServerChannel(3001)
    ]
})

EventBus.getTemperature.on(({ city }) => {
    console.log(`Getting temperature for ${city}`)
    return Math.floor(Math.random() * 100)
})
