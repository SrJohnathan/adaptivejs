/*
 * Copyright (c) 2026 Antonio Johnathan
 *
 * Licensed under the MIT License.
 * See LICENSE file in the project root for full license information.
 */

const fs = require('fs');
const path = require('path');

const NOVO_ESCOPO = '@adaptive-js';

const rotasWorkspace = [
    'packages/*',
    'examples/*',
    'create-adaptive-app',
    'extension/*'
];

rotasWorkspace.forEach(rota => {
    const baseDir = rota.replace('/*', '');
    const caminhoAbsoluto = path.join(__dirname, baseDir);

    if (!fs.existsSync(caminhoAbsoluto)) return;

    const subpastas = rota.endsWith('/*')
        ? fs.readdirSync(caminhoAbsoluto).map(f => path.join(baseDir, f))
        : [baseDir];

    subpastas.forEach(sub => {
        const pkgJsonPath = path.join(__dirname, sub, 'package.json');

        if (fs.existsSync(pkgJsonPath)) {
            const pkgData = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
            const nomeAntigo = pkgData.name;

            const nomeLimpo = nomeAntigo.includes('/') ? nomeAntigo.split('/').pop() : nomeAntigo;

            // 1. Aplica as regras de nomes e escopos solicitadas
            if (sub.startsWith('extension')) {
                pkgData.name = `${NOVO_ESCOPO}/extension-${nomeLimpo}`;
            } else {
                pkgData.name = `${NOVO_ESCOPO}/${nomeLimpo}`;
            }

            // 2. Trava de segurança: Se for da pasta examples, força a flag private
            if (sub.startsWith('examples')) {
                pkgData.private = true;
                console.log(`🔒 Marcado como privado: ${pkgData.name}`);
            }

            fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgData, null, 2) + '\n', 'utf8');
            console.log(`Alterado: ${nomeAntigo} ➡️ ${pkgData.name}`);
        }
    });
});
