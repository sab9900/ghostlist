importScripts('ngsw-worker.js');

const SHARE_CACHE = 'gl-share-target-v1';

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method === 'POST' && url.pathname === '/share') {
        event.respondWith(handleSharePost(event.request));
        return;
    }
});

async function handleSharePost(request) {
    try {
        const formData = await request.formData();
        const title = formData.get('title') ?? '';
        const text = formData.get('text') ?? '';
        const sharedUrl = formData.get('url') ?? '';
        const files = formData.getAll('files');

        const cache = await caches.open(SHARE_CACHE);

        const fileEntries = await Promise.all(
            files.map(async (file, i) => {
                const arrayBuffer = await file.arrayBuffer();
                await cache.put(
                    `/gl-share-file-${i}`,
                    new Response(arrayBuffer, {
                        headers: {
                            'Content-Type': file.type || 'application/octet-stream',
                            'X-File-Name': file.name,
                            'X-File-Size': String(file.size),
                        },
                    })
                );
                return { name: file.name, type: file.type, size: file.size, cacheKey: `/gl-share-file-${i}` };
            })
        );

        const meta = { title, text, url: sharedUrl, files: fileEntries, timestamp: Date.now() };
        await cache.put('/gl-share-meta', new Response(JSON.stringify(meta), {
            headers: { 'Content-Type': 'application/json' },
        }));
    } catch {
    }

    return Response.redirect('/share', 303);
}
