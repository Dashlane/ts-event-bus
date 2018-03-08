import { Slot, connectSlot } from './Slot'
import { Transport } from './Transport'
import { Channel } from './Channel'

export interface EventDeclaration {
    [slotName: string]: Slot<any, any>
}

export function combineEvents<
    C1 extends EventDeclaration,
    C2 extends EventDeclaration,
    C3 extends EventDeclaration,
    C4 extends EventDeclaration,
    C5 extends EventDeclaration,
    C6 extends EventDeclaration,
    C7 extends EventDeclaration,
    C8 extends EventDeclaration,
    C9 extends EventDeclaration,
    C10 extends EventDeclaration,
    C11 extends EventDeclaration,
    C12 extends EventDeclaration,
    C13 extends EventDeclaration,
    C14 extends EventDeclaration,
    C15 extends EventDeclaration,
    C16 extends EventDeclaration,
    C17 extends EventDeclaration,
    C18 extends EventDeclaration,
    C19 extends EventDeclaration,
    C20 extends EventDeclaration,
    C21 extends EventDeclaration,
    C22 extends EventDeclaration,
    C23 extends EventDeclaration,
    C24 extends EventDeclaration
    >(
        c1: C1,
        c2: C2,
        c3?: C3,
        c4?: C4,
        c5?: C5,
        c6?: C6,
        c7?: C7,
        c8?: C8,
        c9?: C9,
        c10?: C10,
        c11?: C11,
        c12?: C12,
        c13?: C13,
        c14?: C14,
        c15?: C15,
        c16?: C16,
        c17?: C17,
        c18?: C18,
        c19?: C19,
        c20?: C20,
        c21?: C21,
        c22?: C22,
        c23?: C23,
        c24?: C24
    ):
    C1
    & C2
    & C3
    & C4
    & C5
    & C6
    & C7
    & C8
    & C9
    & C10
    & C11
    & C12
    & C13
    & C14
    & C15
    & C16
    & C17
    & C18
    & C19
    & C20
    & C21
    & C22
    & C23
    & C24 {
    // TODO: throw if event buses have duplicate events
    return Object.assign({},
        c1,
        c2,
        c3,
        c4,
        c5,
        c6,
        c7,
        c8,
        c9,
        c10,
        c11,
        c12,
        c13,
        c14,
        c15,
        c16,
        c17,
        c18,
        c19,
        c20,
        c21,
        c22,
        c23,
        c24
    )
}

export function createEventBus<C extends EventDeclaration>(args: { events: C, channels?: Channel[] }): C {
    const transports = (args.channels || []).map(c => new Transport(c))
    return Object.keys(args.events)
        .reduce((conn: C, slotName) => {
            conn[slotName] = connectSlot(slotName, transports as Transport[])
            return conn
        }, {} as any)
}
