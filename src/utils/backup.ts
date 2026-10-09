import { db } from '../db/database'

export interface FishingLogBackup {
    format: 'fishing-log-backup'
    version: 1 | 2
    exportedAt: string

    data: {
        trips: unknown[]
        catches: unknown[]
        tripEvents?: unknown[]

        lureManufacturers: unknown[]
        lureSeries: unknown[]
        lureModels: unknown[]
        lureVariants: unknown[]
        myLures: unknown[]
    }
}

export async function createBackup(): Promise<FishingLogBackup> {
    const [
        trips,
        catches,
        tripEvents,
        lureManufacturers,
        lureSeries,
        lureModels,
        lureVariants,
        myLures,
    ] = await Promise.all([
        db.trips.toArray(),
        db.catches.toArray(),
        db.tripEvents.toArray(),
        db.lureManufacturers.toArray(),
        db.lureSeries.toArray(),
        db.lureModels.toArray(),
        db.lureVariants.toArray(),
        db.myLures.toArray(),
    ])

    return {
        format: 'fishing-log-backup',
        version: 2,
        exportedAt: new Date().toISOString(),

        data: {
            trips,
            catches,
            tripEvents,
            lureManufacturers,
            lureSeries,
            lureModels,
            lureVariants,
            myLures,
        },
    }
}

export async function exportBackup() {
    const backup = await createBackup()

    const json = JSON.stringify(backup, null, 2)

    const blob = new Blob([json], {
        type: 'application/json',
    })

    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')

    const now = new Date()

    const date =
        `${now.getFullYear()}-` +
        `${String(now.getMonth() + 1).padStart(2, '0')}-` +
        `${String(now.getDate()).padStart(2, '0')}`

    link.href = url
    link.download = `fishing-log-backup-${date}.json`

    document.body.appendChild(link)
    link.click()
    link.remove()

    URL.revokeObjectURL(url)
}

export async function importBackup(file: File): Promise<void> {
    const text = await file.text()

    let backup: FishingLogBackup

    try {
        backup = JSON.parse(text) as FishingLogBackup
    } catch {
        throw new Error('JSONファイルを読み込めませんでした')
    }

    if (
        backup.format !== 'fishing-log-backup' ||
        (backup.version !== 1 && backup.version !== 2) ||
        !backup.data
    ) {
        throw new Error('Fishing Logのバックアップファイルではありません')
    }

    const {
        trips,
        catches,
        tripEvents,
        lureManufacturers,
        lureSeries,
        lureModels,
        lureVariants,
        myLures,
    } = backup.data

    if (
        !Array.isArray(trips) ||
        !Array.isArray(catches) ||
        !Array.isArray(lureManufacturers) ||
        !Array.isArray(lureSeries) ||
        !Array.isArray(lureModels) ||
        !Array.isArray(lureVariants) ||
        !Array.isArray(myLures)
    ) {
        throw new Error('バックアップデータの形式が正しくありません')
    }

    if (tripEvents !== undefined && !Array.isArray(tripEvents)) {
        throw new Error('イベントデータの形式が正しくありません')
    }

    const restoredEvents = (tripEvents ?? []).map((event: any) => ({
        ...event,
        occurredAt: new Date(event.occurredAt),
    }))

    // JSONではDateが文字列になるため、Date型に戻してから復元する
    const restoredTrips = trips.map((trip: any) => ({
        ...trip,
        startedAt: new Date(trip.startedAt),
        endedAt: trip.endedAt ? new Date(trip.endedAt) : undefined,
    }))

    const restoredCatches = catches.map((catchRecord: any) => ({
        ...catchRecord,
        caughtAt: new Date(catchRecord.caughtAt),
    }))

    await db.transaction(
        'rw',
        [
            db.trips,
            db.catches,
            db.tripEvents,
            db.lureManufacturers,
            db.lureSeries,
            db.lureModels,
            db.lureVariants,
            db.myLures,
        ],
        async () => {
            // 現在のデータを削除
            await db.catches.clear()
            await db.tripEvents.clear()
            await db.myLures.clear()
            await db.lureVariants.clear()
            await db.lureModels.clear()
            await db.lureSeries.clear()
            await db.lureManufacturers.clear()
            await db.trips.clear()

            // バックアップのIDを維持したまま復元
            await db.trips.bulkAdd(restoredTrips)
            await db.lureManufacturers.bulkAdd(lureManufacturers as any[])
            await db.lureSeries.bulkAdd(lureSeries as any[])
            await db.lureModels.bulkAdd(lureModels as any[])
            await db.lureVariants.bulkAdd(lureVariants as any[])
            await db.myLures.bulkAdd(myLures as any[])
            await db.catches.bulkAdd(restoredCatches)
            await db.tripEvents.bulkAdd(restoredEvents)
        }
    )
}