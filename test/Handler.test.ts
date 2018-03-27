import('should')
import * as sinon from 'sinon'

import { callHandlers } from '../src/Handler'

describe('callHandlers()', () => {

    context('with no handler', () => {
        it('should return a Promise', () => {
            const result = callHandlers('my-data', [])
            result.should.have.property('then').which.is.a.Function()
        })
    })

    context('with one handler', () => {

        it('should call this handler with the given data', () => {
            const handlerSpy = sinon.spy()
            const data = 'my-data'
            return callHandlers(data, [handlerSpy])
                .then(() => {
                    sinon.assert.calledOnce(handlerSpy)
                    sinon.assert.calledWith(handlerSpy, data)
                })
        })

        context('which throw an error', () => {

            it('should return a rejected promise', () => {
                const error = new Error('fail')
                const handlerStub = () => {
                    throw error
                }
                return callHandlers('my-data', [handlerStub])
                    .catch(err => {
                        err.should.equal(error)
                    })
            })
        })

        context('which returns a Promise', () => {

            it('should return it', () => {
                const promise = new Promise((resolve) => { resolve('toto') })
                const handlerStub = sinon.stub().returns(promise)

                const result = callHandlers('my-data', [handlerStub])
                result.should.equal(promise)
                return result.then(res => {
                    res.should.equal('toto')
                })
            })

        })

        context('which doesnt return a Promise', () => {
            it('should return a fullfilled promise with the result', () => {
                const data = 'result'
                const handlerStub = sinon.stub().returns(data)

                const result = callHandlers('my-data', [handlerStub])
                result.should.have.property('then').which.is.a.Function()

                return result
                    .then(res => {
                        res.should.equal(data)
                    })
            })
        })
    })

    context('with multiple handlers', () => {
        it('should call all of them with the same given data', async () => {
            const handlerSpies = [sinon.spy(), sinon.spy()]
            const data = 'my-data'
            await callHandlers(data, handlerSpies)
            sinon.assert.calledOnce(handlerSpies[0])
            sinon.assert.calledOnce(handlerSpies[1])
            sinon.assert.calledWith(handlerSpies[0], data)
            sinon.assert.calledWith(handlerSpies[1], data)
        })
    })
})
