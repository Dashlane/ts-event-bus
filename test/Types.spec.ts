import { expectTypeOf } from 'expect-type'
import { createEventBus } from '../src/Events'
import { Slot, slot } from '../src/Slot'

describe('createEventBus', () => {
    type Events = {
        numberToString: Slot<number, string>
        eventToIgnore: Slot<void, void>
    }

    type FilteredEvents = {
        numberToString: Slot<number, string>
    }

    const events: Events = {
        numberToString: slot<number, string>(),
        eventToIgnore: slot<void, void>(),
    }

    it('should return the right types regardless of an ingnoredEvents list being passed or not', () => {
        const eventBus = createEventBus({ events })
        const eventBusWithIgnored = createEventBus({
            events,
            ignoredEvents: ['eventToIgnore'],
        })

        expectTypeOf(eventBus).toEqualTypeOf<Events>()
        expectTypeOf(eventBus).not.toEqualTypeOf<FilteredEvents>()
        expectTypeOf(eventBusWithIgnored).not.toEqualTypeOf<Events>()
        expectTypeOf(eventBusWithIgnored).toEqualTypeOf<FilteredEvents>()
    })
})
