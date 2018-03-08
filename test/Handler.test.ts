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
        it('should call this handler with the given data', (done) => {
            const handlerSpy = sinon.spy()
            const data = 'my-data'
            const result = callHandlers(data, [handlerSpy])
                .then(() => {
                    sinon.assert.calledOnce(handlerSpy)
                    sinon.assert.calledWith(handlerSpy, data)
                    done()
                })
                .catch(err => { throw new Error(err) })
        })

        context('which throw an error', () => {
            it('should return a rejected promise', (done) => {
                const error = new Error('fail')
                const handlerStub = () => {
                    throw error
                }

                callHandlers('my-data', [handlerStub])
                    .catch(err => {
                        err.should.equal(error)
                        done()
                    })
            })
        })

        context('which return a Promise', () => {
            it('should return it', (done) => {
                const promise = new Promise((resolve) => { resolve('toto') })
                const handlerStub = sinon.stub().returns(promise)

                const result = callHandlers('my-data', [handlerStub])
                result.should.equal(promise)
                result.then(res => {
                    res.should.equal('toto')
                    done()
                })
            })
        })

        context('which doesnt return a Promise', () => {
            it('should return a fullfilled promise with the result', (done) => {
                const data = 'result'
                const handlerStub = sinon.stub().returns(data)

                const result = callHandlers('my-data', [handlerStub])
                result.should.have.property('then').which.is.a.Function()

                result
                    .then(res => {
                        res.should.equal(data)
                        done()
                    })
                    .catch(err => { throw new Error(err) })
            })
        })
    })

    context('with multiple handlers', () => {
        it('should call all of them with the same given data', (done) => {
            const handlerSpies = [sinon.spy(), sinon.spy()]
            const data = 'my-data'
            const result = callHandlers(data, handlerSpies)
                .then(() => {
                    sinon.assert.calledOnce(handlerSpies[0])
                    sinon.assert.calledOnce(handlerSpies[1])
                    sinon.assert.calledWith(handlerSpies[0], data)
                    sinon.assert.calledWith(handlerSpies[1], data)
                    done()
                })
                .catch(err => { throw new Error(err) })
        })
    })
})