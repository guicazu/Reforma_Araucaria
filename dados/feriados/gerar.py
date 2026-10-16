# Gera dados/feriados/municipais/<UF>.json (municípios do IBGE com os feriados municipais de cada
# um) e imprime as regras estaduais usadas em js/feriados.js, a partir da base aberta
# https://github.com/joaopbini/feriados-brasil (licença MIT, ver LICENSE-feriados-brasil.txt).
#
# Uso: python3 dados/feriados/gerar.py <pasta com municipios.json, estados.json,
#      municipal_<ano>.json e estadual_<ano>.json baixados de dados/feriados/... do repositório>
#
# Cada feriado vira uma regra que vale para qualquer ano: "MM-DD" (data fixa) ou "P+60" / "P-47"
# (dias a partir do domingo de Páscoa: Corpus Christi, Carnaval...). Os feriados nacionais
# (calculados em js/feriados.js) são retirados das listas municipais e estaduais.
import json, os, re, sys, unicodedata
from datetime import date, timedelta
from collections import defaultdict

PASTA = sys.argv[1]
ANOS = [a for a in range(2018, 2031) if os.path.exists(os.path.join(PASTA, f'municipal_{a}.json'))]
MOVEIS = {-48, -47, -46, -3, -2, 0, 39, 49, 60}
RE_MOVEL = re.compile(r'corpus|carnaval|cinzas|paix|sexta.feira santa|quinta.feira santa|ascens|pentecost|p[aá]scoa', re.I)

def pascoa(ano):
    a = ano % 19; b = ano // 100; c = ano % 100; d = b // 4; e = b % 4; f = (b + 8) // 25; g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30; i = c // 4; k = c % 4; l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451; mes = (h + l - 7 * m + 114) // 31; dia = ((h + l - 7 * m + 114) % 31) + 1
    return date(ano, mes, dia)

def nacionais(ano):
    fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'] + (['11-20'] if ano >= 2024 else [])
    return {date(ano, int(x[:2]), int(x[3:])) for x in fixos} | {pascoa(ano) - timedelta(days=2)}

def ler(nome):
    return json.load(open(os.path.join(PASTA, nome), encoding='utf-8'))

def data_br(t):
    d, m, a = t.split('/')
    return date(int(a), int(m), int(d))

def regras(registros_por_ano, retirar):
    """registros_por_ano: {ano: [(date, nome)]} de um município ou estado -> [[regra, nome]]"""
    if not registros_por_ano:
        return []
    base = max(registros_por_ano)
    saida, vistos = [], set()
    for d, nome in sorted(registros_por_ano[base]):
        if d in nacionais(base):
            continue
        desloc = (d - pascoa(base)).days
        mmdd = d.strftime('%m-%d')
        fixa = movel = 0
        for ano, lista in registros_por_ano.items():
            if ano == base:
                continue
            datas = {x for x, _ in lista}
            fixa += date(ano, d.month, d.day) in datas if not (d.month == 2 and d.day == 29) else 0
            movel += (pascoa(ano) + timedelta(days=desloc)) in datas
        regra = 'P%+d' % desloc if desloc in MOVEIS and (RE_MOVEL.search(nome) or movel > fixa) else mmdd
        if regra in vistos or regra in retirar:
            continue
        vistos.add(regra)
        saida.append([regra, nome.strip()])
    return saida

def sem_acento(t):
    return unicodedata.normalize('NFD', t).encode('ascii', 'ignore').decode().lower()

estados = {e['codigo_uf']: e['uf'] for e in ler('estados.json')}
# estaduais
est = defaultdict(lambda: defaultdict(list))
for ano in ANOS:
    caminho = f'estadual_{ano}.json'
    if not os.path.exists(os.path.join(PASTA, caminho)):
        continue
    for r in ler(caminho):
        est[r['uf']][ano].append((data_br(r['data']), r['nome']))
estaduais = {uf: regras(anos, set()) for uf, anos in sorted(est.items())}
print('export const ESTADUAIS = ' + json.dumps(estaduais, ensure_ascii=False, indent=None) + ';')

# municipais
mun = defaultdict(lambda: defaultdict(list))
for ano in ANOS:
    for r in ler(f'municipal_{ano}.json'):
        mun[r['codigo_ibge']][ano].append((data_br(r['data']), r['nome']))
por_uf = defaultdict(list)
for m in ler('municipios.json'):
    uf = estados[m['codigo_uf']]
    retirar = {x[0] for x in estaduais.get(uf, [])}
    por_uf[uf].append([m['codigo_ibge'], m['nome'], regras(mun.get(m['codigo_ibge'], {}), retirar)])
destino = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'municipais')
os.makedirs(destino, exist_ok=True)
total = com = 0
for uf, lista in por_uf.items():
    lista.sort(key=lambda x: sem_acento(x[1]))
    total += len(lista); com += sum(1 for x in lista if x[2])
    with open(os.path.join(destino, uf + '.json'), 'w', encoding='utf-8') as f:
        json.dump({'uf': uf, 'fonte': 'github.com/joaopbini/feriados-brasil (MIT)', 'anos': ANOS, 'municipios': lista}, f, ensure_ascii=False, separators=(',', ':'))
print(f'// {total} municípios, {com} com feriados municipais na base', file=sys.stderr)
