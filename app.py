import os
import shutil
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import JSONResponse, StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from pydantic import BaseModel
from dotenv import load_dotenv

from db import SessionLocal
from models import Articulo, Pregunta, OpcionRespuesta, Respuesta
from export_wide import build_wide_dataframe_simple


load_dotenv()
PDF_DIR = os.getenv("PDF_DIR", "./pdfs")
FRONTEND_DIR = os.getenv("FRONTEND_DIR", "./frontend")
FRONTEND_DIR = os.path.abspath(FRONTEND_DIR)

app = FastAPI(title="Revision2 API")

# ---- DB dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

from fastapi.responses import RedirectResponse

@app.get("/")
def root():
    return RedirectResponse(url="/app/index.html")


# ---- Schemas Pydantic
class RespuestaIn(BaseModel):
    pregunta_id: int
    respuesta: str
    respuestas_categoricas: Optional[List[str]] = None
    impacto: Optional[str] = None
    valoracion: Optional[int] = None

# ========== Health ==========
@app.get("/health")
def health():
    return {"ok": True}

# ========== Artículos ==========
@app.get("/articulos")
def list_articulos(sort: str = "titulo", db: Session = Depends(get_db)):
    q = db.query(Articulo)
    if sort == "id":
        q = q.order_by(Articulo.id.desc())
    else:
        q = q.order_by(Articulo.titulo.asc())
    items = q.all()
    return [{"id": a.id, "titulo": a.titulo, "pdf_path": a.pdf_path, "resumen": a.resumen} for a in items]

@app.get("/articulos/{aid}")
def get_articulo(aid: int, db: Session = Depends(get_db)):
    a = db.query(Articulo).get(aid)
    if not a:
        raise HTTPException(404, "Artículo no encontrado")
    return {"id": a.id, "titulo": a.titulo, "pdf_path": a.pdf_path, "resumen": a.resumen}

@app.put("/articulos/{aid}")
def update_resumen(aid: int, resumen: str = Form(""), db: Session = Depends(get_db)):
    a = db.query(Articulo).get(aid)
    if not a:
        raise HTTPException(404, "Artículo no encontrado")
    a.resumen = resumen or ""
    db.add(a); db.commit()
    return {"ok": True}

# Subida múltiple de PDFs
@app.post("/articulos/upload-multiple")
def upload_multiple(files: List[UploadFile] = File(...), db: Session = Depends(get_db)):
    if not files:
        raise HTTPException(400, "No se recibieron archivos")
    os.makedirs(PDF_DIR, exist_ok=True)

    created = []
    # Normalizar y ordenar por nombre limpio
    def clean_title(name: str) -> str:
        base = os.path.splitext(os.path.basename(name))[0]
        return " ".join(base.replace("_", " ").replace("-", " ").split()).strip()

    files_sorted = sorted(files, key=lambda f: clean_title(f.filename).lower())
    for f in files_sorted:
        title = clean_title(f.filename)
        out_path = os.path.join(PDF_DIR, f.filename)
        # evitar sobrescritura: si existe, agrega sufijo
        base, ext = os.path.splitext(out_path)
        k = 1
        while os.path.exists(out_path):
            out_path = f"{base}({k}){ext}"
            k += 1
        with open(out_path, "wb") as w:
            shutil.copyfileobj(f.file, w)
        rel_path = os.path.relpath(out_path).replace("\\", "/")

        # crear artículo
        a = Articulo(titulo=title, pdf_path="/" + rel_path, resumen="")
        db.add(a)
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            # si el pdf_path ya existía único, continúa
            continue
        db.refresh(a)
        created.append({"id": a.id, "titulo": a.titulo, "pdf_path": a.pdf_path})

    return created

# ========== Preguntas y opciones ==========
@app.get("/preguntas")
def list_preguntas(db: Session = Depends(get_db)):
    ps = db.query(Pregunta).order_by(Pregunta.orden.asc()).all()
    return [{"id": p.id, "etiqueta": p.etiqueta, "orden": p.orden} for p in ps]

@app.get("/preguntas/{pid}/opciones")
def list_opciones(pid: int, db: Session = Depends(get_db)):
    ops = db.query(OpcionRespuesta).filter(OpcionRespuesta.pregunta_id == pid).order_by(OpcionRespuesta.orden.asc()).all()
    return [{"id": o.id, "opcion": o.opcion, "orden": o.orden} for o in ops]

# ========== Respuestas ==========
@app.get("/articulos/{aid}/respuestas")
def get_respuestas(aid: int, db: Session = Depends(get_db)):
    rs = db.query(Respuesta).filter(Respuesta.articulo_id == aid).all()
    out = []
    for r in rs:
        out.append({
            "pregunta_id": r.pregunta_id,
            "respuesta": r.respuesta,
            "respuestas_categoricas": r.respuestas_categoricas or [],
            "impacto": r.impacto,
            "valoracion": r.valoracion
        })
    return out

@app.post("/articulos/{aid}/respuestas")
def upsert_respuestas(aid: int, payload: List[RespuestaIn], db: Session = Depends(get_db)):
    # Verifica artículo
    a = db.query(Articulo).get(aid)
    if not a:
        raise HTTPException(404, "Artículo no encontrado")

    # Upsert en lote
    for item in payload:
        # Existe?
        r = db.query(Respuesta).filter(
            Respuesta.articulo_id == aid,
            Respuesta.pregunta_id == item.pregunta_id
        ).one_or_none()
        if not item.respuesta or not item.respuesta.strip():
            # Si no hay respuesta abierta, no guardamos (regla de negocio)
            continue
        if r:
            r.respuesta = item.respuesta.strip()
            r.respuestas_categoricas = list(item.respuestas_categoricas or [])
            r.impacto = (item.impacto or "").strip() or None
            r.valoracion = item.valoracion
            db.add(r)
        else:
            nr = Respuesta(
                articulo_id=aid,
                pregunta_id=item.pregunta_id,
                respuesta=item.respuesta.strip(),
                respuestas_categoricas=list(item.respuestas_categoricas or []),
                impacto=(item.impacto or "").strip() or None,
                valoracion=item.valoracion
            )
            db.add(nr)
    db.commit()
    return {"ok": True}

# ========== Export ==========
@app.get("/export/csv")
def export_csv(db: Session = Depends(get_db)):
    df = build_wide_dataframe_simple(db)
    csv_text = df.to_csv(index=False)
    csv_bytes = ("\ufeff" + csv_text).encode("utf-8")  # BOM + UTF-8
    return StreamingResponse(
        iter([csv_bytes]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="Revision2_export.csv"'}
    )

@app.get("/export/xlsx")
def export_xlsx(db: Session = Depends(get_db)):
    df = build_wide_dataframe_simple(db)
    from io import BytesIO
    bio = BytesIO()
    with pd.ExcelWriter(bio, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="AnchoSimple")
    bio.seek(0)
    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="Revision2_export.xlsx"'}
    )




from fastapi.staticfiles import StaticFiles

if os.path.isdir(FRONTEND_DIR):
    app.mount("/app", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

if os.path.isdir(PDF_DIR):
    app.mount("/pdfs", StaticFiles(directory=PDF_DIR), name="pdfs")
