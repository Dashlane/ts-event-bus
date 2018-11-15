import 'should'

import { TestChannel, TestChunkedChannel } from './TestChannel'
import * as sinon from 'sinon'
import { largeData } from './data'

describe('GenericChannel', () => {

    it('should call onConnect subscribers when its _connected method is called', () => {
        const testInstance = new TestChannel()
        const spy = sinon.spy()
        testInstance.onConnect(spy)
        testInstance.callConnected()
        spy.called.should.be.True()
    })

    it('should call onDisconnect subscribers when its _disconnected method is called', () => {
        const testInstance = new TestChannel()
        const spy = sinon.spy()
        testInstance.onDisconnect(spy)
        testInstance.callDisconnected()
        spy.called.should.be.True()
    })

    it('should call onData callbacks when its _messageReceived method is called', () => {
        const testInstance = new TestChannel()
        const spy = sinon.spy()
        testInstance.onData(spy)
        testInstance.callMessageReceived()
        spy.called.should.be.True()
    })

    it('should call onError callbacks when its _error method is called', () => {
        const testInstance = new TestChannel()
        const spy = sinon.spy()
        testInstance.onError(spy)
        testInstance.callError()
        spy.called.should.be.True()
    })

})


describe('ChunkedChannel', () => {
    const generateTest = (testObject: any, chunkSize: number) => {
        const objSize = JSON.stringify(testObject).length

        // +2 for chunk_start & chunk_end messages
        const numberOfMessages = Math.ceil(objSize / chunkSize) + 2

        const testInstance = new TestChunkedChannel(chunkSize)
        testInstance.onData(d => {
            testInstance.sendSpy.getCall(0).args[0].type.should.equal('chunk_start')
            testInstance.sendSpy.getCall(1).args[0].type.should.equal('chunk_data')
            testInstance.sendSpy.getCall(1).args[0].chunkId.should.be.a.String
            testInstance.sendSpy.getCall(1).args[0].data.should.be.lengthOf(chunkSize)
            d.should.match(testObject)
            testInstance.sendSpy.callCount.should.equal(numberOfMessages)
            testInstance.dataSpy.callCount.should.equal(1)
        })
        testInstance.send(testObject)
    }


    const cases = [
        {
            name: 'a basic request',
            testObject: {
                type: 'request',
                slotName: 'test',
                id: '1',
                data: { aKey: 'someData' }
            },
            chunkSize: 10
        },

        {
            name: 'a request with special characters',
            testObject: {
                type: 'request',
                slotName: 'testジ',
                id: '1',
                data: { aKey: 'ジンボはリンゴを食べる。' }
            },
            chunkSize: 10
        },

        {
            name: 'a large request',
            testObject: {
                type: 'request',
                slotName: 'test',
                id: '42',
                data: largeData
            },
            chunkSize: 101
        }
    ]

    cases.forEach(c => {
        it(`should work for ${c.name}`, () => {
            generateTest(c.testObject, c.chunkSize)
        })
    })

    it('should not chunk small messages', () => {
        const smallObject = { bli: 'bla' }
        const testInstance = new TestChunkedChannel(100)
        testInstance.onData(d => {
            // The first message sent should be the message itself, instead of 'chunk_start'
            testInstance.sendSpy.getCall(0).args[0].should.match(smallObject)
            testInstance.sendSpy.callCount.should.equal(1)
            testInstance.dataSpy.callCount.should.equal(1)
        })
        testInstance.send(smallObject as any)
    })

    it('should work when using small intermediate strings to merge the chunks into a big string', () => {
        const obj = {
            type: 'request',
            slotName: 'test',
            id: '42',
            data: largeData
        }
        const testInstance = new TestChunkedChannel(100, 500)
        testInstance.onData(d => {
            testInstance.dataSpy.getCall(0).args[0].should.match(obj)
        })
        testInstance.send(obj as any)
    })

})
