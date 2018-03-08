import { slot, Slot } from './../../../src'

export default {
    getWeather: slot<{ city: string }, { weather: 'FINE' | 'TERRIBLE', temperature: number }>(),
    getTemperature: slot<{ city: string }, number>()
}
