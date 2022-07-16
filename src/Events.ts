import { Slot, connectSlot } from './Slot'
import { Transport } from './Transport'
import { Channel } from './Channel'

export interface EventDeclaration {
    [slotName: string]: Slot<any, any>
}

// Explanation to how this type function: https://fettblog.eu/typescript-union-to-intersection/
// tl;dr Wrapping and unwrapping the generic into a fn force the unions to be an intersection
type UnionToIntersection<T> = (T extends any ? (x: T) => any : never) extends (
    x: infer R
) => any
    ? R
    : never

export function combineEvents<
    Events extends EventDeclaration[]
>(
    ...args: Events
    // Using `Events[number]` to get the values inside the indexed array
): UnionToIntersection<Events[number]> {
    const keys = args.reduce((acc, arg) => {
        acc.push.apply(acc, Object.keys(arg))
        return acc
    }, [])

    const uniqKeys = [...new Set(keys)]

    if (keys.length > uniqKeys.length) {
        throw new Error('ts-event-bus: duplicate slots encountered in combineEvents.')
    }

    return Object.assign({}, ...args)
}

export function createEventBus<C extends EventDeclaration>(args: { events: C, channels?: Channel[] }): C {
    const transports = (args.channels || []).map(c => new Transport(c))
export function omitEvents<
    Events extends EventDeclaration,
    OmittedEvents extends keyof Events
>(events: Events, omittedEvents: OmittedEvents[]): Omit<Events, OmittedEvents> {
    return Object.keys(events).reduce((acc, event) => {
        if (!omittedEvents.includes(event as OmittedEvents)) {
            acc[event as keyof Events] = events[event]
        }
        return acc
    }, {} as any)
}

    const eventBus: Partial<C> = {}
    for (const event in args.events) {
        if (args.events.hasOwnProperty(event)) {
            eventBus[event] = (connectSlot(event, transports, args.events[event].config) as C[Extract<keyof C, string>])
        }
    }

    return eventBus as C
}
