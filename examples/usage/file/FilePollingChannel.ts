import { GenericChannel } from './../../../src'
import { readFileSync, writeFileSync } from 'fs'
import { setInterval } from 'timers'

type FileData = {
    _id: number;
    message: any;
}[]

export class FilePollingChannel extends GenericChannel {

    public timeout = 8000
    private _id = Date.now()

    constructor(private _filename: string) {
        super()
        this._connected()
        this._emptyFile()
        setInterval(() => {
            const fileData = this._read()
            if (!fileData) return
            const message = fileData
                .filter(d => d._id !== this._id)
                .pop()
            if (message) {
                this._messageReceived(message.message)
                this._emptyFile()
            }
        }, 1000)
    }

    private _emptyFile(): void {
        writeFileSync(this._filename, JSON.stringify([]))
    }

    private _read(): FileData | void {
        try {
            return JSON.parse(readFileSync(this._filename).toString()) as any as FileData
        } catch (err) {
            this._error(err)
        }
    }

    public send(message: any) {
        const data = this._read()
        if (!data) return
        data.push({
            _id: this._id,
            message
        })
        writeFileSync(this._filename, JSON.stringify(data))
    }
}
