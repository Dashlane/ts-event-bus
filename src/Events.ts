import { Slot, connectSlot } from './Slot'
import { Transport } from './Transport'
import { Channel } from './Channel'

export interface EventDeclaration {
    [slotName: string]: Slot<any, any>
}

export function combineEvents<
    C1 extends EventDeclaration, C2 extends EventDeclaration, C3 extends EventDeclaration,
    C4 extends EventDeclaration, C5 extends EventDeclaration, C6 extends EventDeclaration,
    C7 extends EventDeclaration, C8 extends EventDeclaration, C9 extends EventDeclaration,
    C10 extends EventDeclaration, C11 extends EventDeclaration, C12 extends EventDeclaration,
    C13 extends EventDeclaration, C14 extends EventDeclaration, C15 extends EventDeclaration,
    C16 extends EventDeclaration, C17 extends EventDeclaration, C18 extends EventDeclaration,
    C19 extends EventDeclaration, C20 extends EventDeclaration, C21 extends EventDeclaration,
    C22 extends EventDeclaration, C23 extends EventDeclaration, C24 extends EventDeclaration
    >(
        _c1: C1, _c2: C2, _c3?: C3, _c4?: C4, _c5?: C5, _c6?: C6, _c7?: C7, _c8?: C8,
        _c9?: C9, _c10?: C10, _c11?: C11, _c12?: C12, _c13?: C13, _c14?: C14, _c15?: C15,
        _c16?: C16, _c17?: C17, _c18?: C18, _c19?: C19, _c20?: C20, _c21?: C21, _c22?: C22,
        _c23?: C23, _c24?: C24
    ): C1 & C2 & C3 & C4 & C5 & C6 & C7 & C8 & C9 & C10 & C11 & C12 & C13 & C14 & C15 & C16
    & C17 & C18 & C19 & C20 & C21 & C22 & C23 & C24 {

    const args = Array.from(arguments)

    const keys = args.reduce((keys, arg) => {
        return [...keys, ...Object.keys(arg)]
    }, [])

    const uniqKeys = [...new Set(keys)]

    if (keys.length > uniqKeys.length) {
        throw new Error('ts-event-bus: duplicate slots encountered in combineEvents.')
    }

    return Object.assign({}, ...args)
}

export function createEventBus<C extends EventDeclaration>(args: { events: C, channels?: Channel[] }): C {
    const transports = (args.channels || []).map(c => new Transport(c))
    return Object.keys(args.events)
        .reduce((conn: C, slotName) => {
            const config = args.events[slotName].config
            conn[slotName] = connectSlot(slotName, transports as Transport[], config)
            return conn
        }, {} as any)
}
