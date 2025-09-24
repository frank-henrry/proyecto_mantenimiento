import re
import pandas as pd
from sqlalchemy.orm import Session
from models import Articulo, Pregunta, OpcionRespuesta, Respuesta

# Limpia etiquetas de opción:
# - quita prefijo "a) ", "b) ", etc.
# - quita el texto entre paréntesis " ( ... )" para RQ como DALL-E (Generación de imágenes) -> DALL-E
# - colapsa espacios
def clean_label(op_text: str) -> str:
    t = op_text.strip()
    t = re.sub(r"^[a-zA-Z]\)\s*", "", t)     # quita "a) "
    t = re.sub(r"\s*\([^)]*\)", "", t)       # quita " ( ... )"
    t = re.sub(r"\s+", " ", t).strip()
    return t

# Convierte a nombre de columna seguro (sin perder tildes; Excel las soporta con BOM)
def col_name(q_ord: int, label: str) -> str:
    base = (label.replace("/", " ")
                 .replace("-", " ")
                 .replace(".", " ")
                 .replace(",", " ")
                 .strip())
    base = re.sub(r"\s+", "_", base)
    return f"Q{q_ord}_{base}"

def build_wide_dataframe_simple(db: Session) -> pd.DataFrame:
    # 1) Base: artículos
    arts = db.query(Articulo).order_by(Articulo.id.asc()).all()
    rows = [{"id": a.id, "titulo": a.titulo, "resumen": a.resumen or ""} for a in arts]
    df = pd.DataFrame(rows) if rows else pd.DataFrame(columns=["id", "titulo", "resumen"])

    # 2) Cargar preguntas y opciones (en orden)
    preguntas = db.query(Pregunta).order_by(Pregunta.orden.asc()).all()
    opts_map = {
        p.id: db.query(OpcionRespuesta)
                .filter(OpcionRespuesta.pregunta_id == p.id)
                .order_by(OpcionRespuesta.orden.asc()).all()
        for p in preguntas
    }

    # 3) Cargar respuestas (por artículo/pregunta)
    resp_rows = db.query(Respuesta).all()
    resp_map = {(r.articulo_id, r.pregunta_id): r for r in resp_rows}

    # 4) Crear columnas binarias por cada opción en orden, tipo Qn_Label
    ordered_cols = ["id", "titulo", "resumen"]
    for p in preguntas:
        opts = opts_map.get(p.id, [])
        for op in opts:
            label = clean_label(op.opcion)
            col = col_name(p.orden, label)
            if col not in df.columns:
                df[col] = 0
            ordered_cols.append(col)

    # 5) Rellenar 0/1 según respuestas_categoricas
    for idx, row in df.iterrows():
        a_id = row["id"]
        for p in preguntas:
            r = resp_map.get((a_id, p.id))
            if not r or not r.respuestas_categoricas:
                continue
            selected = set(r.respuestas_categoricas)
            for op in opts_map.get(p.id, []):
                if op.opcion in selected:
                    label = clean_label(op.opcion)
                    col = col_name(p.orden, label)
                    df.at[idx, col] = 1

    # 6) Orden final de columnas
    seen = set()
    final_cols = [c for c in ordered_cols if not (c in seen or seen.add(c))]
    df = df[final_cols]
    return df
