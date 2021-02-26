import { callHandlers } from '../src/Handler'

describe('callHandlers()', () => {

    describe('with no handler', () => {
        it('should return a Promise', () => {
            const result = callHandlers('my-data', [])
            expect(typeof result.then).toBe('function')
        })
    })

    describe('with one handler', () => {

        it('should call this handler with the given data', () => {
            const handlerSpy = jest.fn()
            const data = 'my-data'
            return callHandlers(data, [handlerSpy])
                .then(() => {
                    expect(handlerSpy).toBeCalledWith(data)
                })
        })

        describe('which throw an error', () => {

            it('should return a rejected promise', () => {
                const error = new Error('fail')
                const handlerStub = () => {
                    throw error
                }
                expect(callHandlers('my-data', [handlerStub])).rejects.toEqual(error)
            })
        })

        describe('which returns a Promise', () => {

            it('should return it', async () => {
                const promise = new Promise((resolve) => { resolve('toto') })
                const handlerStub = jest.fn(() => promise)

                const result = callHandlers('my-data', [handlerStub])
                expect(result).toEqual(promise)
                expect(result).resolves.toEqual('toto')
            })

        })

        describe('which doesnt return a Promise', () => {
            it('should return a fullfilled promise with the result', () => {
                const data = 'result'
                const handlerStub = jest.fn(() => data)

                const result = callHandlers('my-data', [handlerStub])
                expect(result).resolves.toEqual(data)
            })
        })
    })

    describe('with multiple handlers', () => {
        it('should call all of them with the same given data', async () => {
            const handlerSpies = [jest.fn(), jest.fn()]
            const data = 'my-data'
            await callHandlers(data, handlerSpies)
            expect(handlerSpies[0]).toHaveBeenCalledWith(data)
            expect(handlerSpies[1]).toHaveBeenCalledWith(data)
        })
    })
})
