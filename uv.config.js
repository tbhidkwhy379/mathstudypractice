self.__uv$config = {
    prefix: '/uv/service/',
    bare: "https://openbare.xyz/bare/",
    encodeUrl: Ultraviolet.codec.xor.encode,
    decodeUrl: Ultraviolet.codec.xor.decode,
    handler: './uv.handler.js',
    bundle: './uv.bundle.js',
    config: './uv.config.js',
    sw: './uv.sw.js',
};
