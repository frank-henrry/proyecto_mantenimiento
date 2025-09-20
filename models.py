from sqlalchemy import Column, BigInteger, Integer, Text, TIMESTAMP, func, UniqueConstraint, ForeignKey
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()

class Articulo(Base):
    __tablename__ = "articulos"
    id = Column(BigInteger, primary_key=True)
    titulo = Column(Text, nullable=False)
    pdf_path = Column(Text, nullable=False, unique=True)
    resumen = Column(Text)
    creado_en = Column(TIMESTAMP(timezone=True), server_default=func.now())

class Pregunta(Base):
    __tablename__ = "preguntas"
    id = Column(BigInteger, primary_key=True)
    etiqueta = Column(Text, nullable=False, unique=True)
    orden = Column(Integer, nullable=False, unique=True)

class OpcionRespuesta(Base):
    __tablename__ = "opciones_respuesta"
    id = Column(BigInteger, primary_key=True)
    pregunta_id = Column(BigInteger, ForeignKey("preguntas.id", ondelete="CASCADE"), nullable=False)
    opcion = Column(Text, nullable=False)
    orden = Column(Integer, nullable=False)

class Respuesta(Base):
    __tablename__ = "respuestas"
    id = Column(BigInteger, primary_key=True)
    articulo_id = Column(BigInteger, ForeignKey("articulos.id", ondelete="CASCADE"), nullable=False)
    pregunta_id = Column(BigInteger, ForeignKey("preguntas.id", ondelete="CASCADE"), nullable=False)
    respuesta = Column(Text, nullable=False)
    respuestas_categoricas = Column(ARRAY(Text))  # array de opciones
    impacto = Column(Text)
    valoracion = Column(Integer)  # CHECK (1..5) ya está en BD
    __table_args__ = (UniqueConstraint("articulo_id", "pregunta_id", name="uq_respuesta"),)
