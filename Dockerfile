#
# 渗透测试智能体的多阶段 Dockerfile
# 使用 Chainguard Wolfi 以最小化攻击面和供应链安全

# 构建阶段 - 安装工具和依赖
FROM cgr.dev/chainguard/wolfi-base:latest AS builder

# 安装 Wolfi 中可用的系统依赖
RUN apk update && apk add --no-cache \
    # 核心构建工具
    build-base \
    git \
    curl \
    wget \
    ca-certificates \
    # Go 工具的网络库
    libpcap-dev \
    linux-headers \
    # 语言运行时
    go \
    nodejs-22 \
    npm \
    python3 \
    py3-pip \
    ruby \
    ruby-dev \
    # Wolfi 中可用的安全工具
    nmap \
    # 其他实用工具
    bash

# 设置 Go 的环境变量
ENV GOPATH=/go
ENV PATH=$GOPATH/bin:/usr/local/go/bin:$PATH
ENV CGO_ENABLED=1

# 创建目录
RUN mkdir -p $GOPATH/bin

# 安装基于 Go 的安全工具
RUN go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest
# 从 GitHub 安装 WhatWeb（基于 Ruby 的工具）
RUN git clone --depth 1 https://github.com/urbanadventurer/WhatWeb.git /opt/whatweb && \
    chmod +x /opt/whatweb/whatweb && \
    gem install addressable && \
    echo '#!/bin/bash' > /usr/local/bin/whatweb && \
    echo 'cd /opt/whatweb && exec ./whatweb "$@"' >> /usr/local/bin/whatweb && \
    chmod +x /usr/local/bin/whatweb

# 安装基于 Python 的工具
RUN pip3 install --no-cache-dir schemathesis

# 运行时阶段 - 最小化生产镜像
FROM cgr.dev/chainguard/wolfi-base:latest AS runtime

# 仅安装运行时依赖
USER root
RUN apk update && apk add --no-cache \
    # 核心实用工具
    git \
    bash \
    curl \
    ca-certificates \
    # 网络库（运行时）
    libpcap \
    # 安全工具
    nmap \
    # 语言运行时（最小化）
    nodejs-22 \
    npm \
    python3 \
    ruby \
    # Playwright 的 Chromium 浏览器和依赖
    chromium \
    # Chromium 需要的其他库
    nss \
    freetype \
    harfbuzz \
    # 无头浏览器的 X11 库
    libx11 \
    libxcomposite \
    libxdamage \
    libxext \
    libxfixes \
    libxrandr \
    mesa-gbm \
    # 字体渲染
    fontconfig

# 从构建阶段复制 Go 二进制文件
COPY --from=builder /go/bin/subfinder /usr/local/bin/

# 从构建阶段复制 WhatWeb
COPY --from=builder /opt/whatweb /opt/whatweb
COPY --from=builder /usr/local/bin/whatweb /usr/local/bin/whatweb

# 在运行时阶段安装 WhatWeb 的 Ruby 依赖
RUN gem install addressable

# 从构建阶段复制 Python 包
COPY --from=builder /usr/lib/python3.*/site-packages /usr/lib/python3.12/site-packages
COPY --from=builder /usr/bin/schemathesis /usr/bin/

# 创建非根用户以提高安全性
RUN addgroup -g 1001 pentest && \
    adduser -u 1001 -G pentest -s /bin/bash -D pentest

# 设置工作目录
WORKDIR /app

# 先复制包文件以获得更好的缓存
COPY package*.json ./
COPY mcp-server/package*.json ./mcp-server/

# 安装 Node.js 依赖（包括 TypeScript 构建所需的开发依赖）
RUN npm ci && \
    cd mcp-server && npm ci && cd .. && \
    npm cache clean --force

# 复制应用程序源代码
COPY . .

# 构建 TypeScript（先构建 mcp-server，然后构建主项目）
RUN cd mcp-server && npm run build && cd .. && npm run build

# 构建后移除开发依赖以减少镜像大小
RUN npm prune --production && \
    cd mcp-server && npm prune --production

# 创建会话数据目录并确保适当的权限
RUN mkdir -p /app/sessions /app/deliverables /app/repos /app/configs && \
    mkdir -p /tmp/.cache /tmp/.config /tmp/.npm && \
    chmod 777 /app && \
    chmod 777 /tmp/.cache && \
    chmod 777 /tmp/.config && \
    chmod 777 /tmp/.npm && \
    chown -R pentest:pentest /app

# 切换到非根用户
USER pentest

# 设置环境变量
ENV NODE_ENV=production
ENV PATH="/usr/local/bin:$PATH"
ENV SHANNON_DOCKER=true
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV npm_config_cache=/tmp/.npm
ENV HOME=/tmp
ENV XDG_CACHE_HOME=/tmp/.cache
ENV XDG_CONFIG_HOME=/tmp/.config

# 配置 Git 身份并信任所有目录
RUN git config --global user.email "agent@localhost" && \
    git config --global user.name "Pentest Agent" && \
    git config --global --add safe.directory '*'

# 设置入口点
ENTRYPOINT ["node", "dist/shannon.js"]
