import {
    createEventBus
} from './../../../src'
import Events from './events'
import { FilePollingChannel } from './FilePollingChannel'

const EventBus = createEventBus({
    events: Events,
    channels: [
        new FilePollingChannel('soliloque.txt')
    ]
})

EventBus.commentVa.on(prenom => {
    console.log(`Il m'a demandé comment ${prenom} allait`)
    return Math.random() > 0.5 ? 'MAL' : Math.random() > 0.3 ? 'BIEN' : 'CA DEPEND'
})
