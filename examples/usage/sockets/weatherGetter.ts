import { createEventBus } from './../../../src'
import Events from './events'
import {
    WebSocketClientChannel,
    WebSocketServerChannel
} from './../../channels/WebSocket'

const EventBus = createEventBus({
    events: Events,
    channels: [
        new WebSocketClientChannel('ws://127.0.0.1:3001'),
        new WebSocketServerChannel(3000)
    ]
})

EventBus.getWeather.on(({ city }) => {
    console.log(`Getting weather for ${city}`)
    return EventBus.getTemperature({ city })
        .then(temperature => {
            return {
                weather: 'FINE' as 'FINE' | 'TERRIBLE',
                temperature
            }
        })
})
