import { createEventBus } from './../../../src'
import Events from './events'
import { WebSocketClientChannel } from './../../channels/NativeWebSocket'
import { setTimeout } from 'timers'

const EventBus = createEventBus({
    events: Events,
    channels: [
        new WebSocketClientChannel('ws://127.0.0.1:3000')
    ]
})

const cities = [
    'San Francisco',
    'Los Angeles',
    'New York',
    'Minneapolis'
]

function getWeather() {
    console.log('getWeather')
    if (!cities.length) return
    const city = cities.pop() as string

    EventBus.getWeather({ city })
        .then(weather => {
            console.log(`The Weather in ${city} is: ${JSON.stringify(weather)}`)
        })
        .catch((err: Error) => console.error(err))
    setTimeout(getWeather, 5000)
}

setTimeout(getWeather, 5000)
