import { Slot, connectSlot } from './Slot'
import { Transport } from './Transport'
import { Channel } from './Channel'

export interface EventDeclaration {
    [slotName: string]: Slot<any, any>
}

export function combineEvents<C extends EventDeclaration>(...args: C[]): { [P in keyof C]: C[P] } {
    // TODO: throw if event buses have duplicate events
    return Object.assign({}, ...args)
}

export function createEventBus<C extends EventDeclaration>(args: { events: C, channels?: Channel[] }): C {
    const transports = (args.channels || []).map(c => new Transport(c))
    return Object.keys(args.events)
        .reduce((conn: C, slotName) => {
            conn[slotName] = connectSlot(slotName, transports as Transport[])
            return conn
        }, {} as any)
}
