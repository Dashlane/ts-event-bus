# ts-event-bus
[<img src="./by_dashlane.svg" width="220"/>](https://www.dashlane.com/)

[![Build Status](https://travis-ci.org/Dashlane/ts-event-bus.svg?branch=master)](https://travis-ci.org/Dashlane/ts-event-bus)

Distributed messaging in Typescript

`ts-event-bus` is a lightweight distributed messaging system. It allows several modules, potentially distributed over different runtime spaces to communicate through typed messages.

## Getting started

### Declare your events

Using `ts-event-bus` starts with the declaration of the interface that your components share:

```typescript
// MyEvents.ts
import { slot, Slot } from 'ts-event-bus'

const MyEvents = {
    sayHello: slot<string>(),
    getTime: slot<null, string>(),
    multiply: slot<{a: number, b: number}, number>(),
    ping: slot<void>(),
}

export default MyEvents
```

### Create EventBus
Your components will then instantiate an event bus based on this declaration, using whatever channel they may want to communicate on.
If you specify no `Channel`, it means that you will exchange events in the same memory space.

For instance, one could connect two node processes over WebSocket:

```typescript
// firstModule.EventBus.ts
import { createEventBus } from 'ts-event-bus'
import MyEvents from './MyEvents.ts'
import MyBasicWebSocketChannel from './MyBasicWebSocketChannel.ts'

const EventBus = createEventBus({
    events: MyEvents,
    channels: [ new MyBasicWebSocketChannel('ws://your_host') ]
})

export default EventBus
```

```typescript
// secondModule.EventBus.ts
import { createEventBus } from 'ts-event-bus'
import MyEvents from './MyEvents.ts'
import MyBasicWebSocketChannel from './MyBasicWebSocketChannel.ts'

const EventBus = createEventBus({
    events: MyEvents,
    channels: [ new MyBasicWebSocketChannel('ws://your_host') ]
})
```

### Usage

Once connected, the clients can start by using the slots on the event bus

```typescript
// firstModule.ts
import EventBus from './firstModule.EventBus.ts'

// Triggering an event always returns a promise
EventBus.sayHello('michel').then(() => {
    ...
})

EventBus.getTime().then((time) => {
    ...
})

EventBus.multiply({a: 2, b: 5 }).then((result) => {
    ...
})

EventBus.ping()
```

```typescript
// secondModule.ts
import EventBus from './secondModule.EventBus.ts'

EventBus.ping().on(() => {
    console.log('pong')
})

EventBus.sayHello.on(name => {
    console.log(`${name} said hello!`)
})

// Event subscribers can respond to the event synchronously (by returning a value)
EventBus.getTime.on(() => new Date().toString)

// Or asynchronously (by returning a Promise that resolves with the value).
EventBus.multiply.on(({ a, b }) => new Promise((resolve, reject) => {
    AsynchronousMultiplier(a, b, (err, result) => {
        if (err) {
            return reject(err)
        }
        resolve(result)
    })
}))
```

Calls and subscriptions on slots are typechecked
```typescript
EventBus.multiply({a: 1, c: 2}) // Compile error: property 'c' does not exist on type {a: number, b: number}

EventBus.multiply.on(({a, b}) => {
    if (a.length > 2) { // Compile error: property 'length' does not exist on type 'number'
        ...
    }
})
```

### Syntactic sugar

You can combine events from different sources.
```typescript
import { combineEvents } from 'ts-event-bus'
import MyEvents from './MyEvents.ts'
import MyOtherEvents from './MyOtherEvents.ts'

const MyCombinedEvents = combineEvents(
    MyEvents,
    MyOtherEvents,
)

export default MyCombinedEvents
```

## Using and Implementing Channels

`ts-event-bus` comes with an abstract class [GenericChannel](./src/Channel.ts).
To implement your own channel create a new class extending `GenericChannel`, and call the method given by the abstract class: _connected(), _disconnected(), _error(e: Error) and _messageReceived(data: any).

Basic WebSocket Channel example:
```typescript
import { GenericChannel } from 'ts-event-bus'

export class MyBasicWebSocketChannel extends GenericChannel {
    private _ws: WebSocket | null = null
    private _host: string

    constructor(host: string) {
        super()
        this._host = host
        this._init()
    }

    private _init(): void {
        const ws = new WebSocket(this._host)

        ws.onopen = (e: Event) => {
            this._connected()
            this._ws = ws
        }

        ws.onerror = (e: Event) => {
            this._ws = null
            this._error(e)
            this._disconnected()
            setTimeout(() => {
                this._init()
            }, 2000)
        }

        ws.onclose = (e: CloseEvent) => {
            if (ws === this._ws) {
                this._ws = null
                this._disconnected()
                this._init()
            }
        }

        ws.onmessage = (e: MessageEvent) => {
            this._messageReceived(e.data)
        }
    }
}
```


## Examples

- [Channel implementation](./examples/channels)
- [Usage](./examples/usage)
