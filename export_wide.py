import re
import pandas as pd
from sqlalchemy.orm import Session
from models import Articulo, Pregunta, OpcionRespuesta, Respuesta

def slug_col(texto: str) -> str:
    t = re.sub(r"\s+", "_", texto.strip(), flags=re.UNICODE)
    t = t.replace("(", "").replace(")", "").replace("/", "_").replace("-", "_").replace(".", "_")
    t = re.sub(r"__+", "_", t)
    return t

def build_wide_dataframe(db: Session) -> pd.DataFrame:
    # Base: artículos
    arts = db.query(Articulo).order_by(Articulo.id.asc()).all()
    rows = []
    for a in arts:
        rows.append({"articulo_id": a.id, "titulo": a.titulo, "resumen": a.resumen or ""})
    df = pd.DataFrame(rows) if rows else pd.DataFrame(columns=["articulo_id","titulo","resumen"])

    # Preguntas (ordenadas)
    preguntas = db.query(Pregunta).order_by(Pregunta.orden.asc()).all()
    # Pre-cargar respuestas por artículo/pregunta
    resp_rows = db.query(Respuesta).all()
    resp_map = {}
    for r in resp_rows:
        resp_map[(r.articulo_id, r.pregunta_id)] = r

    # Pre-cargar opciones por pregunta
    opts_map = {}
    for p in preguntas:
        opts = db.query(OpcionRespuesta).filter(OpcionRespuesta.pregunta_id == p.id).order_by(OpcionRespuesta.orden.asc()).all()
        opts_map[p.id] = opts

    # Ir expandiendo columnas por RQ
    for p in preguntas:
        # columnas de texto por RQ
        col_resp = f"rq{p.orden}_respuesta"
        col_imp  = f"rq{p.orden}_impacto"
        col_val  = f"rq{p.orden}_valoracion"
        if col_resp not in df.columns: df[col_resp] = ""
        if col_imp  not in df.columns: df[col_imp]  = ""
        if col_val  not in df.columns: df[col_val]  = pd.NA

        # columnas binarias por opción
        opts = opts_map.get(p.id, [])
        opt_cols = []
        otros_col = None
        for op in opts:
            base = slug_col(op.opcion)
            col = f"rq{p.orden}_{base}".lower()
            df[col] = 0
            opt_cols.append((op.opcion, col))
            if "otros" in op.opcion.lower():
                otros_col = f"rq{p.orden}_otros_text"
                if otros_col not in df.columns:
                    df[otros_col] = ""

        # llenar por artículo
        for idx, row in df.iterrows():
            a_id = row["articulo_id"]
            r = resp_map.get((a_id, p.id))
            if not r:
                continue
            # texto
            df.at[idx, col_resp] = r.respuesta or ""
            df.at[idx, col_imp]  = r.impacto or ""
            df.at[idx, col_val]  = r.valoracion
            # categóricas
            selected = set(r.respuestas_categoricas or [])
            for label, col in opt_cols:
                if label in selected:
                    df.at[idx, col] = 1
            # otros_text si procede
            if otros_col and any("otros" in x.lower() for x in selected):
                # usar la respuesta abierta como detalle (o podrías personalizar)
                df.at[idx, otros_col] = r.respuesta or ""

    # Orden de columnas: articulo_id, titulo, resumen, luego RQ1..., RQ2...
    first_cols = ["articulo_id", "titulo", "resumen"]
    other_cols = [c for c in df.columns if c not in first_cols]
    df = df[first_cols + sorted(other_cols, key=lambda x: (x.split("_")[0], x))]
    return df
