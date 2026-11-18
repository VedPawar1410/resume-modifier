# Sourced API: FastAPI + pdflatex in one image.
#
# TeX Live comes from its own installer (basic scheme + only the packages the résumé template
# uses), not Debian's texlive-* packages: fontawesome5 alone would pull in ~1 GB of fonts there.
# A small image matters because Azure Container Apps scales to zero and pulls it on wake-up.
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends wget perl ca-certificates xz-utils fontconfig \
 && rm -rf /var/lib/apt/lists/*

# ── TeX Live (basic) + the template's packages ───────────────────────────────
RUN mkdir /tmp/install-tl \
 && wget -qO- https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz \
    | tar -xz -C /tmp/install-tl --strip-components=1 \
 && printf '%s\n' \
      "selected_scheme scheme-basic" \
      "TEXDIR /opt/texlive" \
      "TEXMFLOCAL /opt/texlive/texmf-local" \
      "TEXMFSYSVAR /opt/texlive/texmf-var" \
      "TEXMFSYSCONFIG /opt/texlive/texmf-config" \
      "instopt_adjustpath 0" \
      "tlpdbopt_install_docfiles 0" \
      "tlpdbopt_install_srcfiles 0" \
      > /tmp/install-tl/profile \
 && perl /tmp/install-tl/install-tl --profile=/tmp/install-tl/profile --no-interaction \
 && ln -s /opt/texlive/bin/$(ls /opt/texlive/bin) /opt/texlive/bin/current \
 && /opt/texlive/bin/current/tlmgr install \
      titlesec marvosym enumitem fontawesome5 fancyhdr babel-english preprint \
 && rm -rf /tmp/install-tl /opt/texlive/texmf-var/web2c/*.log
ENV PATH=/opt/texlive/bin/current:$PATH

# ── App ──────────────────────────────────────────────────────────────────────
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# Runs as root on purpose: latex_service drops pdflatex to `nobody` with setpriv, which
# needs root, so user-supplied LaTeX can't read the API's environment (its secrets).
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
