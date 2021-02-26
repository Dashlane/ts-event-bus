import { TestChannel, TestChunkedChannel } from './TestChannel'
import { largeData } from './data'

describe('GenericChannel', () => {
    it('should call onConnect subscribers when its _connected method is called', () => {
        const testInstance = new TestChannel()
        const spy = jest.fn()
        testInstance.onConnect(spy)
        testInstance.callConnected()
        expect(spy).toHaveBeenCalled()
    })

    it('should call onDisconnect subscribers when its _disconnected method is called', () => {
        const testInstance = new TestChannel()
        const spy = jest.fn()
        testInstance.onDisconnect(spy)
        testInstance.callDisconnected()
        expect(spy).toHaveBeenCalled()
    })

    it('should call onData callbacks when its _messageReceived method is called', () => {
        const testInstance = new TestChannel()
        const spy = jest.fn()
        testInstance.onData(spy)
        testInstance.callMessageReceived()
        expect(spy).toHaveBeenCalled()
    })

    it('should call onError callbacks when its _error method is called', () => {
        const testInstance = new TestChannel()
        const spy = jest.fn()
        testInstance.onError(spy)
        testInstance.callError()
        expect(spy).toHaveBeenCalled()
    })

})


describe('ChunkedChannel', () => {
    const generateTest = (testObject: any, chunkSize: number) => {
        const objSize = JSON.stringify(testObject).length

        // +2 for chunk_start & chunk_end messages
        const numberOfMessages = Math.ceil(objSize / chunkSize) + 2

        const testInstance = new TestChunkedChannel(chunkSize)
        testInstance.onData(d => {
            expect(testInstance.sendSpy.mock.calls[0][0].type).toEqual('chunk_start')
            expect(testInstance.sendSpy.mock.calls[1][0].type).toEqual('chunk_data')
            expect(typeof testInstance.sendSpy.mock.calls[1][0].chunkId).toEqual('string')
            expect(testInstance.sendSpy.mock.calls[1][0].data).toHaveLength(chunkSize)
            expect(d).toMatchObject(testObject)
            expect(testInstance.sendSpy.mock.calls).toHaveLength(numberOfMessages)
            expect(testInstance.dataSpy.mock.calls).toHaveLength(1)
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
            expect(testInstance.sendSpy.mock.calls[0][0]).toMatchObject(smallObject)
            expect(testInstance.sendSpy.mock.calls).toHaveLength(1)
            expect(testInstance.dataSpy.mock.calls).toHaveLength(1)
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
            expect(testInstance.dataSpy.mock.calls[0][0]).toMatchObject(obj)
        })
        testInstance.send(obj as any)
    })

})
