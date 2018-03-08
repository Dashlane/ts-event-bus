import {
    createEventBus
} from './../../../src'
import Events from './events'
import { FilePollingChannel } from './FilePollingChannel'
import { setInterval } from 'timers'

const EventBus = createEventBus({
    events: Events,
    channels: [
        new FilePollingChannel('soliloque.txt')
    ]
})

setInterval(() => {
    console.log('asking')
    EventBus
        .commentVa(Math.random() > 0.5 ? 'JEAN-LOUIS' : 'MICHEL')
        .then(response => {
            console.log(`IL A REPONDU: ${response}`)
        })
        .catch(err => {
            console.log(`OUPS ${err}`)
        })
}, 5000)
